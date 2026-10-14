from functools import lru_cache

from supabase import Client, create_client

from .config import get_settings


def get_auth_client() -> Client:
    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_anon_key:
        raise RuntimeError("Supabase authentication is not configured.")
    return create_client(settings.supabase_url, settings.supabase_anon_key)


@lru_cache
def get_service_client() -> Client:
    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise RuntimeError("Supabase server credentials are not configured.")
    return create_client(settings.supabase_url, settings.supabase_service_role_key)
