import asyncio
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import uuid4

import httpx2
import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric.ec import (
    SECP256R1,
    EllipticCurvePrivateKey,
    EllipticCurvePublicKey,
    generate_private_key,
)

from app.api.dependencies import get_supabase_jwt_verifier
from app.core.security import (
    REQUIRED_JWT_CLAIMS,
    SigningKeysUnavailableError,
    SupabaseJwtVerifier,
)
from app.main import app

TEST_ISSUER = "https://test-project.supabase.co/auth/v1"
TEST_AUDIENCE = "authenticated"
TEST_USER_ID = uuid4()
TEST_PRIVATE_KEY = generate_private_key(SECP256R1())
TEST_PUBLIC_KEY = TEST_PRIVATE_KEY.public_key()


class StaticSigningKeyProvider:
    def __init__(self, public_key: EllipticCurvePublicKey) -> None:
        self.public_key = public_key

    async def get_signing_key(self, _key_id: str) -> EllipticCurvePublicKey:
        return self.public_key


class UnavailableSigningKeyProvider:
    async def get_signing_key(self, _key_id: str) -> EllipticCurvePublicKey:
        raise SigningKeysUnavailableError("JWKS endpoint unavailable")


def create_test_token(
    *,
    private_key: EllipticCurvePrivateKey = TEST_PRIVATE_KEY,
    claim_overrides: dict[str, Any] | None = None,
    missing_claim: str | None = None,
    token_type: str = "JWT",
) -> str:
    issued_at = datetime.now(UTC)
    claims: dict[str, Any] = {
        "aud": TEST_AUDIENCE,
        "email": "planner@example.com",
        "exp": issued_at + timedelta(minutes=5),
        "iat": issued_at,
        "iss": TEST_ISSUER,
        "role": "authenticated",
        "sub": str(TEST_USER_ID),
    }
    claims.update(claim_overrides or {})
    if missing_claim is not None:
        claims.pop(missing_claim)

    return jwt.encode(
        claims,
        private_key,
        algorithm="ES256",
        headers={"kid": "test-signing-key", "typ": token_type},
    )


def create_test_verifier(
    public_key: EllipticCurvePublicKey = TEST_PUBLIC_KEY,
) -> SupabaseJwtVerifier:
    return SupabaseJwtVerifier(
        issuer=TEST_ISSUER,
        audience=TEST_AUDIENCE,
        signing_key_provider=StaticSigningKeyProvider(public_key),
    )


def get_response(
    path: str,
    *,
    access_token: str | None = None,
    jwt_verifier: SupabaseJwtVerifier | None = None,
) -> httpx2.Response:
    verifier = jwt_verifier or create_test_verifier()

    async def provide_jwt_verifier() -> SupabaseJwtVerifier:
        return verifier

    async def send_request() -> httpx2.Response:
        transport = httpx2.ASGITransport(app=app)
        headers = {"Authorization": f"Bearer {access_token}"} if access_token else {}
        async with httpx2.AsyncClient(
            transport=transport,
            base_url="http://testserver",
        ) as client:
            return await client.get(path, headers=headers)

    app.dependency_overrides[get_supabase_jwt_verifier] = provide_jwt_verifier
    try:
        return asyncio.run(send_request())
    finally:
        app.dependency_overrides.clear()


def assert_invalid_token_response(response: httpx2.Response) -> None:
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"
    assert response.json() == {
        "error": {
            "code": "invalid_token",
            "message": "The access token is invalid.",
        }
    }


def test_auth_me_returns_verified_user() -> None:
    response = get_response("/api/v1/auth/me", access_token=create_test_token())

    assert response.status_code == 200
    assert response.json() == {
        "user_id": str(TEST_USER_ID),
        "role": "authenticated",
        "email": "planner@example.com",
    }


def test_auth_me_rejects_missing_token() -> None:
    response = get_response("/api/v1/auth/me")

    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"
    assert response.json() == {
        "error": {
            "code": "authentication_required",
            "message": "Authentication is required.",
        }
    }


def test_auth_me_rejects_expired_token() -> None:
    issued_at = datetime.now(UTC) - timedelta(minutes=10)
    token = create_test_token(
        claim_overrides={
            "exp": issued_at + timedelta(minutes=5),
            "iat": issued_at,
        }
    )

    response = get_response("/api/v1/auth/me", access_token=token)

    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"
    assert response.json() == {
        "error": {
            "code": "token_expired",
            "message": "The access token has expired.",
        }
    }


@pytest.mark.parametrize("missing_claim", REQUIRED_JWT_CLAIMS)
def test_auth_me_rejects_missing_required_claim(missing_claim: str) -> None:
    token = create_test_token(missing_claim=missing_claim)

    response = get_response("/api/v1/auth/me", access_token=token)

    assert_invalid_token_response(response)


@pytest.mark.parametrize(
    ("claim_overrides", "token_type"),
    [
        ({"iss": "https://another-project.supabase.co/auth/v1"}, "JWT"),
        ({"aud": "another-audience"}, "JWT"),
        ({"role": "service_role"}, "JWT"),
        ({"sub": "not-a-uuid"}, "JWT"),
        ({}, "at+jwt"),
    ],
)
def test_auth_me_rejects_invalid_claims_or_token_type(
    claim_overrides: dict[str, Any],
    token_type: str,
) -> None:
    token = create_test_token(
        claim_overrides=claim_overrides,
        token_type=token_type,
    )

    response = get_response("/api/v1/auth/me", access_token=token)

    assert_invalid_token_response(response)


def test_auth_me_rejects_invalid_signature() -> None:
    unrelated_private_key = generate_private_key(SECP256R1())
    token = create_test_token(private_key=unrelated_private_key)

    response = get_response("/api/v1/auth/me", access_token=token)

    assert_invalid_token_response(response)


def test_auth_me_rejects_non_es256_algorithm() -> None:
    issued_at = datetime.now(UTC)
    token = jwt.encode(
        {
            "aud": TEST_AUDIENCE,
            "exp": issued_at + timedelta(minutes=5),
            "iat": issued_at,
            "iss": TEST_ISSUER,
            "role": "authenticated",
            "sub": str(TEST_USER_ID),
        },
        "test-only-secret-with-at-least-32-bytes",
        algorithm="HS256",
        headers={"kid": "test-signing-key", "typ": "JWT"},
    )

    response = get_response("/api/v1/auth/me", access_token=token)

    assert_invalid_token_response(response)


def test_auth_me_returns_service_unavailable_when_jwks_cannot_be_loaded() -> None:
    verifier = SupabaseJwtVerifier(
        issuer=TEST_ISSUER,
        audience=TEST_AUDIENCE,
        signing_key_provider=UnavailableSigningKeyProvider(),
    )

    response = get_response(
        "/api/v1/auth/me",
        access_token=create_test_token(),
        jwt_verifier=verifier,
    )

    assert response.status_code == 503
    assert response.json() == {
        "error": {
            "code": "authentication_service_unavailable",
            "message": "Authentication key verification is temporarily unavailable.",
        }
    }


def test_health_endpoint_remains_public() -> None:
    response = get_response("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "lets-do-backend"}
