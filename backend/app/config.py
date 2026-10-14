from functools import lru_cache
from pathlib import Path
from urllib.parse import urlsplit

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_service_role_key: str = ""
    stream_api_key: str = ""
    stream_api_secret: str = ""
    legal_ai_api_url: str = ""
    legal_ai_api_key: str = ""
    cors_origins: str = "http://localhost:8000,http://127.0.0.1:8000"

    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[1] / ".env",
        extra="ignore",
    )

    @property
    def allowed_origins(self) -> list[str]:
        origins = [origin.strip().rstrip("/") for origin in self.cors_origins.split(",")]
        return [
            origin if origin.startswith(("http://", "https://")) else f"https://{origin}"
            for origin in origins
            if origin
        ]

    @property
    def legal_ai_chat_url(self) -> str:
        url = self.legal_ai_api_url.strip().rstrip("/")
        if not url.startswith(("http://", "https://")):
            url = f"https://{url}"
        if not urlsplit(url).path:
            return f"{url}/chat"
        return url


@lru_cache
def get_settings() -> Settings:
    return Settings()
