"""Queue consumer responsible for fetching tasks from Redis."""
from __future__ import annotations

import asyncio
import logging
import time
from typing import Optional

from .config import get_settings
from .logger import get_logger, log_with_context
from .metrics import worker_io_time_seconds, worker_waiting_seconds
from .redis_client import RedisClient
from .utils import timer

logger = get_logger(__name__)


class QueueConsumer:
    """Continuously polls Redis queues using BLPOP."""

    def __init__(self, redis_client: RedisClient, worker_id: str) -> None:
        self._redis = redis_client
        self._settings = get_settings()
        self._worker_id = worker_id
        self._waiting_since: Optional[float] = None
        self._last_wait_log: float = 0.0

    async def fetch(self) -> tuple[str, str, float] | None:
        queue_keys = await self._redis.scan_brand_queues()
        if not queue_keys:
            await asyncio.sleep(self._settings.blpop_timeout_sec)
            self._update_waiting(None)
            return None

        with timer() as timing:
            result = await self._redis.blpop(queue_keys, timeout=self._settings.blpop_timeout_sec)
        fetch_time_ms = timing["elapsed_ms"]

        if result is None:
            self._update_waiting(queue_keys)
            worker_io_time_seconds.labels(self._worker_id, "unknown", "fetch").observe(
                fetch_time_ms / 1000
            )
            return None

        queue_key, payload = result
        self._clear_waiting()
        worker_io_time_seconds.labels(self._worker_id, extract_brand_from_queue(queue_key), "fetch").observe(
            fetch_time_ms / 1000
        )
        log_with_context(
            logger,
            level=logging.INFO,
            message="Fetched chunk from Redis",
            context={
                "worker_id": self._worker_id,
                "queue": queue_key,
            },
            metrics={"fetch_time_ms": fetch_time_ms},
        )
        return queue_key, payload, fetch_time_ms

    def _update_waiting(self, queues: Optional[list[str]]) -> None:
        now = time.perf_counter()
        if self._waiting_since is None:
            self._waiting_since = now
        elapsed = now - self._waiting_since
        worker_waiting_seconds.labels(self._worker_id).set(elapsed)
        if now - self._last_wait_log >= self._settings.metrics_wait_log_interval_sec:
            queue_names = ", ".join(queues or ["<none>"])
            log_with_context(
                logger,
                level=logging.INFO,
                message="Waiting for new tasks",
                context={"worker_id": self._worker_id, "queues": queue_names},
                metrics={"waiting_seconds": elapsed},
            )
            self._last_wait_log = now

    def _clear_waiting(self) -> None:
        self._waiting_since = None
        worker_waiting_seconds.labels(self._worker_id).set(0)


def extract_brand_from_queue(queue_key: str) -> str:
    parts = queue_key.split(":")
    return parts[2] if len(parts) >= 3 else "unknown"
