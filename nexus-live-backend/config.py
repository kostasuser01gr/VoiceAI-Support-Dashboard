"""Application configuration with Pydantic settings."""

from __future__ import annotations

import os
from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Gemini
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"
    gemini_vision_model: str = "gemini-2.5-flash"

    # GCP
    gcp_project_id: str = ""
    gcp_region: str = "us-central1"

    # Firestore
    firestore_collection: str = "nexus_scans"

    # Application
    app_env: str = "development"
    app_port: int = 8080
    log_level: str = "INFO"
    cors_origins: str = "http://localhost:3000,http://localhost:8080"

    # Security
    api_secret_key: str = "dev-secret-key-change-in-production"
    rate_limit_per_minute: int = 60

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    @property
    def cloud_run_url(self) -> str | None:
        """Detect Cloud Run service URL from environment."""
        service = os.environ.get("K_SERVICE")
        os.environ.get("K_REVISION")
        if service:
            return f"https://{service}-{self.gcp_region}.run.app"
        return None


@lru_cache
def get_settings() -> Settings:
    return Settings()
