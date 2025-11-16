"""Configuration handling for the Service 3 worker."""
from __future__ import annotations

import uuid
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration loaded from environment variables."""

    redis_url: str = Field(description="Redis connection URI")
    worker_id: str | None = Field(default=None, description="Unique worker identifier")
    chunk_batch_size: int = Field(ge=1)
    embeddings_provider: Literal["local", "openai", "gemini"]
    llm_provider: Literal["mock", "openai", "gemini"]
    embedding_api_key: str | None = None
    llm_api_key: str | None = None
    gemini_api_key: str | None = None
    openai_api_key: str | None = None
    gemini_model: str
    gemini_api_version: str = Field(default="v1", description="Gemini API version, e.g., v1")
    openai_model: str
    max_retries: int = Field(ge=0)
    retry_backoff_base: float = Field(ge=0.0)
    prometheus_port: int = Field(ge=1)
    http_port: int = Field(ge=1)
    log_level: Literal["debug", "info", "warning", "error", "critical"]
    heartbeat_interval_sec: int = Field(ge=1)
    blpop_timeout_sec: int = Field(ge=1)
    redis_queue_prefix: str = Field(description="Prefix for brand queues")
    redis_result_prefix: str = Field(description="Prefix for result queues")
    redis_failed_prefix: str = Field(description="Prefix for failure queues")
    redis_spike_prefix: str = Field(description="Prefix for spike history")
    spike_history_ttl_sec: int = Field(ge=60)
    llm_summary_max_tokens: int = Field(ge=16)
    llm_timeout_sec: int = Field(ge=1)
    llm_min_delay_sec: float = Field(default=2.0, ge=0.0)
    embeddings_batch_size: int = Field(ge=1)
    metrics_wait_log_interval_sec: int = Field(ge=1)
    preprocessing_examples: int = Field(ge=1)
    llm_max_concurrency: int = Field(default=4, ge=1)

    model_config = SettingsConfigDict(env_file=str(Path(__file__).resolve().parents[2] / ".env"), env_prefix="", case_sensitive=False)

    @classmethod
    def settings_customise_sources(
        cls,
        settings_cls,
        init_settings,
        env_settings,
        dotenv_settings,
        file_secret_settings,
    ):
        return (env_settings, dotenv_settings, init_settings, file_secret_settings)

    def __init__(self, **data):
        super().__init__(**data)
        self._generated_worker_id: str | None = None

    @property
    def effective_worker_id(self) -> str:
        if self.worker_id:
            return self.worker_id
        if self._generated_worker_id is None:
            self._generated_worker_id = f"worker-{uuid.uuid4()}"
        return self._generated_worker_id

    @model_validator(mode="after")
    def _validate_llm_configuration(self) -> "Settings":
        if self.llm_provider == "gemini" and not self.gemini_api_key:
            raise ValueError("GEMINI_API_KEY must be set when LLM_PROVIDER is 'gemini'")
        if self.llm_provider == "openai" and not self.openai_api_key:
            raise ValueError("OPENAI_API_KEY must be set when LLM_PROVIDER is 'openai'")
        if self.embeddings_provider != "local" and not self.embedding_api_key:
            raise ValueError("EMBEDDING_API_KEY must be set when EMBEDDINGS_PROVIDER is not 'local'")
        return self


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return cached settings instance."""

    return Settings()
