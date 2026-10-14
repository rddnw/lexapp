from dataclasses import dataclass
from typing import Any

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from postgrest.exceptions import APIError
from supabase_auth.errors import AuthApiError

from .supabase import get_auth_client, get_service_client


bearer_scheme = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class Principal:
    id: str
    email: str
    name: str
    role: str
    verified: bool
    is_admin: bool


def require_principal(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> Principal:
    if not credentials:
        raise HTTPException(status_code=401, detail="Authentication required.")

    try:
        response = get_auth_client().auth.get_user(credentials.credentials)
        user: Any = response.user
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail="Authentication service is not configured.") from error
    except AuthApiError as error:
        raise HTTPException(status_code=401, detail="Invalid or expired session.") from error
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired session.")

    try:
        profile_response = (
            get_service_client()
            .table("profiles")
            .select("id,full_name,role,is_verified")
            .eq("id", str(user.id))
            .maybe_single()
            .execute()
        )
    except HTTPException:
        raise
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail="Database service is not configured.") from error
    except APIError as error:
        raise HTTPException(status_code=503, detail="Account database is unavailable.") from error

    profile = profile_response.data
    if not profile:
        raise HTTPException(status_code=403, detail="Account profile is not available.")

    return Principal(
        id=str(user.id),
        email=user.email or "",
        name=profile["full_name"],
        role=profile["role"],
        verified=profile["is_verified"],
        is_admin=(user.app_metadata or {}).get("lex_role") == "admin",
    )


def require_admin(user: Principal = Depends(require_principal)) -> Principal:
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Administrator access required.")
    return user
