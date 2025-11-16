"""Structured logging utilities for the worker service."""
from __future__ import annotations

import json
import logging
import sys
from typing import Any, Mapping

_LEVEL_MAP: dict[str, int] = {
    "debug": logging.DEBUG,
    "info": logging.INFO,
    "warning": logging.WARNING,
    "error": logging.ERROR,
    "critical": logging.CRITICAL,
}


class JsonFormatter(logging.Formatter):
    """Render log records as JSON for ingestion-friendly output."""

    default_time_format = "%Y-%m-%dT%H:%M:%S"
    default_msec_format = "%s.%03dZ"

    def format(self, record: logging.LogRecord) -> str:  # noqa: D401
        payload: dict[str, Any] = {
            "timestamp": self.formatTime(record, self.default_time_format),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        if record.stack_info:
            payload["stack"] = record.stack_info

        for key, value in record.__dict__.items():
            if key.startswith("metrics_"):
                payload.setdefault("metrics", {})[key.replace("metrics_", "")] = value
            elif key.startswith("context_"):
                payload.setdefault("context", {})[key.replace("context_", "")] = value
        return json.dumps(payload, default=str)


def configure_logging(level: str = "info") -> None:
    """Configure root logger for structured JSON output."""

    logging.captureWarnings(True)
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())

    root = logging.getLogger()
    root.setLevel(_LEVEL_MAP.get(level.lower(), logging.INFO))
    root.handlers.clear()
    root.addHandler(handler)


def get_logger(name: str | None = None) -> logging.Logger:
    """Return a configured logger."""

    return logging.getLogger(name or "worker")


def log_with_context(logger: logging.Logger, level: int, message: str, *, context: Mapping[str, Any] | None = None, metrics: Mapping[str, Any] | None = None) -> None:
    extra: dict[str, Any] = {}
    if context:
        for key, value in context.items():
            extra[f"context_{key}"] = value
    if metrics:
        for key, value in metrics.items():
            extra[f"metrics_{key}"] = value
    logger.log(level, message, extra=extra)
