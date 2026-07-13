"""
backend/app/core/config.py — Centralized application settings.

All environment-overridable settings live here. Uses Pydantic BaseSettings
so values can be loaded from a `.env` file at the project root or from
actual environment variables (env vars take priority).
"""

import os
from typing import List
from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    """Application-wide settings, loaded from env vars / .env file."""

    # ── Environment ───────────────────────────────────────────────────────
    ENVIRONMENT: str = Field(default="development", description="development | staging | production")
    DEBUG: bool = Field(default=True, description="Enable debug mode")

    # ── Database ──────────────────────────────────────────────────────────
    DATABASE_URL: str = Field(
        default="postgresql+asyncpg://postgres:postgres@localhost:5432/sandeep_traders",
        description="Async database connection string"
    )

    # ── JWT / Auth ────────────────────────────────────────────────────────
    SECRET_KEY: str = Field(default="LFDNHfAACM9jk6Fu-KI4XoQF-dnW0H_cIgjJWAhFi2g", description="JWT signing key")
    ALGORITHM: str = Field(default="HS256", description="JWT signing algorithm")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(default=15, description="Access token expiry in minutes")
    REFRESH_TOKEN_EXPIRE_DAYS: int = Field(default=7, description="Refresh token expiry in days")

    # ── CORS ──────────────────────────────────────────────────────────────
    CORS_ORIGINS: List[str] = Field(
        default=["http://localhost:3000", "http://127.0.0.1:3000"],
        description="Allowed CORS origins"
    )

    # ── Connection Pool (PostgreSQL) ──────────────────────────────────────
    DB_POOL_SIZE: int = 10
    DB_MAX_OVERFLOW: int = 20
    DB_POOL_RECYCLE: int = 1800

    model_config = {
        "env_file": [
            os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), ".env"),
            ".env",
        ],
        "env_file_encoding": "utf-8",
        "case_sensitive": True,
        "extra": "ignore",
    }


settings = Settings()
