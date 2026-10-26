from functools import lru_cache
from typing import Annotated

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import get_settings
from app.core.errors import AuthenticationRequiredError
from app.core.security import (
    AuthenticatedUser,
    SupabaseJwtVerifier,
    SupabaseSigningKeyProvider,
)

bearer_security = HTTPBearer(auto_error=False)


@lru_cache
def create_supabase_jwt_verifier() -> SupabaseJwtVerifier:
    settings = get_settings()
    return SupabaseJwtVerifier(
        issuer=settings.supabase_auth_issuer,
        audience=settings.supabase_jwt_audience,
        signing_key_provider=SupabaseSigningKeyProvider(settings.supabase_jwks_url),
    )


async def get_supabase_jwt_verifier() -> SupabaseJwtVerifier:
    return create_supabase_jwt_verifier()


async def get_authenticated_user(
    credentials: Annotated[
        HTTPAuthorizationCredentials | None,
        Depends(bearer_security),
    ],
    jwt_verifier: Annotated[
        SupabaseJwtVerifier,
        Depends(get_supabase_jwt_verifier),
    ],
) -> AuthenticatedUser:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise AuthenticationRequiredError

    return await jwt_verifier.verify(credentials.credentials)
