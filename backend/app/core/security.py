import asyncio
import time
from dataclasses import dataclass
from typing import Any, Protocol
from uuid import UUID

import httpx2
import jwt
from jwt import PyJWK
from jwt.exceptions import ExpiredSignatureError, PyJWKError
from jwt.exceptions import (
    InvalidTokenError as PyJwtInvalidTokenError,
)

from app.core.errors import (
    AuthenticationServiceUnavailableError,
    InvalidTokenError,
    TokenExpiredError,
)

ALLOWED_JWT_ALGORITHMS = ["ES256"]
REQUIRED_JWT_CLAIMS = ["aud", "exp", "iat", "iss", "role", "sub"]
JWKS_CACHE_LIFETIME_SECONDS = 600
JWKS_REQUEST_TIMEOUT_SECONDS = 5
JWKS_UNKNOWN_KEY_REFRESH_INTERVAL_SECONDS = 30


@dataclass(frozen=True, slots=True)
class AuthenticatedUser:
    user_id: UUID
    role: str
    email: str | None


class SigningKeyProvider(Protocol):
    async def get_signing_key(self, key_id: str) -> Any: ...


class SigningKeysUnavailableError(Exception):
    """Raised when the configured JWKS document cannot be loaded safely."""


class SigningKeyNotFoundError(Exception):
    """Raised when the requested key ID is absent from the cached JWKS document."""


class SupabaseSigningKeyProvider:
    def __init__(self, jwks_url: str) -> None:
        self.jwks_url = jwks_url
        self.cached_keys: dict[str, Any] = {}
        self.cache_expires_at = 0.0
        self.last_refresh_at = 0.0
        self.refresh_lock = asyncio.Lock()

    async def get_signing_key(self, key_id: str) -> Any:
        current_time = time.monotonic()
        cached_key = self.cached_keys.get(key_id)
        if cached_key is not None and current_time < self.cache_expires_at:
            return cached_key

        async with self.refresh_lock:
            current_time = time.monotonic()
            cached_key = self.cached_keys.get(key_id)
            if cached_key is not None and current_time < self.cache_expires_at:
                return cached_key

            cache_expired = current_time >= self.cache_expires_at
            unknown_key_refresh_allowed = (
                current_time - self.last_refresh_at >= JWKS_UNKNOWN_KEY_REFRESH_INTERVAL_SECONDS
            )
            if cache_expired or unknown_key_refresh_allowed:
                await self._refresh_keys()

            signing_key = self.cached_keys.get(key_id)
            if signing_key is None:
                raise SigningKeyNotFoundError
            return signing_key

    async def _refresh_keys(self) -> None:
        try:
            async with httpx2.AsyncClient(
                timeout=JWKS_REQUEST_TIMEOUT_SECONDS,
            ) as http_client:
                response = await http_client.get(self.jwks_url)
                response.raise_for_status()
                jwks_document = response.json()

            signing_keys = self._parse_signing_keys(jwks_document)
        except (httpx2.HTTPError, TypeError, ValueError) as error:
            raise SigningKeysUnavailableError from error

        current_time = time.monotonic()
        self.cached_keys = signing_keys
        self.last_refresh_at = current_time
        self.cache_expires_at = current_time + JWKS_CACHE_LIFETIME_SECONDS

    @staticmethod
    def _parse_signing_keys(jwks_document: Any) -> dict[str, Any]:
        if not isinstance(jwks_document, dict):
            raise ValueError("JWKS document must be an object")

        raw_keys = jwks_document.get("keys")
        if not isinstance(raw_keys, list):
            raise ValueError("JWKS document must contain a keys list")

        signing_keys: dict[str, Any] = {}
        for raw_key in raw_keys:
            if not isinstance(raw_key, dict):
                continue
            key_id = raw_key.get("kid")
            if (
                not isinstance(key_id, str)
                or raw_key.get("alg") != "ES256"
                or raw_key.get("kty") != "EC"
                or raw_key.get("crv") != "P-256"
            ):
                continue
            if raw_key.get("use") not in (None, "sig"):
                continue
            key_operations = raw_key.get("key_ops")
            if key_operations is not None and (
                not isinstance(key_operations, list) or "verify" not in key_operations
            ):
                continue

            try:
                signing_keys[key_id] = PyJWK.from_dict(raw_key, algorithm="ES256").key
            except (PyJWKError, TypeError, ValueError):
                continue

        return signing_keys


class SupabaseJwtVerifier:
    def __init__(
        self,
        *,
        issuer: str,
        audience: str,
        signing_key_provider: SigningKeyProvider,
    ) -> None:
        self.issuer = issuer
        self.audience = audience
        self.signing_key_provider = signing_key_provider

    async def verify(self, token: str) -> AuthenticatedUser:
        try:
            token_header = jwt.get_unverified_header(token)
            if token_header.get("alg") != "ES256" or token_header.get("typ") != "JWT":
                raise InvalidTokenError

            key_id = token_header.get("kid")
            if not isinstance(key_id, str) or not key_id:
                raise InvalidTokenError

            signing_key = await self.signing_key_provider.get_signing_key(key_id)
            decoded_token = jwt.decode_complete(
                token,
                key=signing_key,
                algorithms=ALLOWED_JWT_ALGORITHMS,
                audience=self.audience,
                issuer=self.issuer,
                options={"require": REQUIRED_JWT_CLAIMS},
            )
        except ExpiredSignatureError as error:
            raise TokenExpiredError from error
        except SigningKeysUnavailableError as error:
            raise AuthenticationServiceUnavailableError from error
        except SigningKeyNotFoundError as error:
            raise InvalidTokenError from error
        except (PyJwtInvalidTokenError, ValueError, TypeError) as error:
            raise InvalidTokenError from error

        verified_header = decoded_token["header"]
        token_claims = decoded_token["payload"]

        if verified_header.get("alg") != "ES256" or verified_header.get("typ") != "JWT":
            raise InvalidTokenError
        if token_claims.get("role") != "authenticated":
            raise InvalidTokenError

        try:
            user_id = UUID(token_claims["sub"])
        except (AttributeError, TypeError, ValueError) as error:
            raise InvalidTokenError from error

        email = token_claims.get("email")
        if email is not None and not isinstance(email, str):
            raise InvalidTokenError

        return AuthenticatedUser(
            user_id=user_id,
            role="authenticated",
            email=email,
        )
