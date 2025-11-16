"""Utility helpers for timing, retries, and JSON parsing."""
from __future__ import annotations

import asyncio
import json
import time
from collections.abc import Awaitable, Callable
from contextlib import asynccontextmanager, contextmanager, suppress
from typing import Any, TypeVar

from redis.backoff import ExponentialBackoff
from redis.exceptions import RedisError


T = TypeVar("T")


def safe_json_loads(payload: str) -> Any:
    """Parse JSON and raise ValueError if invalid."""

    try:
        return json.loads(payload)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid JSON payload: {exc}") from exc


@contextmanager
def timer() -> Any:
    """Simple context manager returning elapsed milliseconds."""

    start = time.perf_counter()
    result: dict[str, float] = {"elapsed_ms": 0.0}
    try:
        yield result
    finally:
        result["elapsed_ms"] = (time.perf_counter() - start) * 1000


async def with_retry(
    operation: Callable[[], Awaitable[T]],
    *,
    retries: int,
    base_delay: float,
    logger,
    operation_name: str,
) -> T:
    """Retry coroutine with exponential backoff for Redis operations."""

    backoff = ExponentialBackoff(base=base_delay, cap=10)
    attempt = 0
    while True:
        try:
            return await operation()
        except RedisError as exc:
            attempt += 1
            if attempt > retries:
                logger.error(
                    "%s failed after retries",
                    operation_name,
                    extra={"context_error": str(exc), "context_attempt": attempt},
                )
                raise
            delay = next(backoff)
            logger.warning(
                "%s failed, retrying",
                operation_name,
                extra={"context_error": str(exc), "context_attempt": attempt, "context_delay": delay},
            )
            await asyncio.sleep(delay)


@asynccontextmanager
async def background_task(task: Callable[[], Awaitable[None]]):
    """Run an async task in the background and ensure cleanup."""

    task_obj = asyncio.create_task(task())
    try:
        yield
    finally:
        task_obj.cancel()
        with suppress(asyncio.CancelledError):
            await task_obj
