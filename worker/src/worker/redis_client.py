"""Async Redis client wrapper."""
from __future__ import annotations

import asyncio
from typing import Any, Iterable

from redis import asyncio as redis_asyncio
from redis.exceptions import RedisError

from .config import get_settings
from .logger import get_logger
from .utils import with_retry

logger = get_logger(__name__)


class RedisClient:
    """Encapsulates Redis interactions with retry logic."""

    def __init__(self, url: str | None = None) -> None:
        settings = get_settings()
        self._url = url or settings.redis_url
        self._client = redis_asyncio.Redis.from_url(self._url, decode_responses=True)
        self._settings = settings
        self._lock = asyncio.Lock()

    @property
    def client(self) -> redis_asyncio.Redis:
        return self._client

    async def ensure_connection(self) -> None:
        await with_retry(
            self._client.ping,
            retries=self._settings.max_retries,
            base_delay=self._settings.retry_backoff_base,
            logger=logger,
            operation_name="redis_ping",
        )

    async def blpop(self, keys: list[str], timeout: int) -> tuple[str, str] | None:
        if not keys:
            await asyncio.sleep(timeout)
            return None

        async def _op() -> tuple[str, str] | None:
            return await self._client.blpop(*keys, timeout=timeout)

        try:
            return await _op()
        except RedisError as exc:
            logger.error("BLPOP failed", extra={"context_error": str(exc)})
            await asyncio.sleep(timeout)
            return None

    async def rpush(self, key: str, value: str) -> None:
        await with_retry(
            lambda: self._client.rpush(key, value),
            retries=self._settings.max_retries,
            base_delay=self._settings.retry_backoff_base,
            logger=logger,
            operation_name="redis_rpush",
        )

    async def set_heartbeat(self, worker_id: str, interval: int) -> None:
        ttl = max(interval * 2, interval + 5)
        try:
            await self._client.set(f"workers:heartbeat:{worker_id}", "alive", ex=ttl)
        except RedisError as exc:
            logger.warning("Heartbeat failed", extra={"context_error": str(exc)})

    async def record_failure(self, key: str, value: str) -> None:
        await with_retry(
            lambda: self._client.rpush(key, value),
            retries=self._settings.max_retries,
            base_delay=self._settings.retry_backoff_base,
            logger=logger,
            operation_name="redis_record_failure",
        )

    async def scan_brand_queues(self) -> list[str]:
        pattern = f"{self._settings.redis_queue_prefix}:*:chunks"
        cursor = 0
        results: list[str] = []
        try:
            while True:
                cursor, chunk = await self._client.scan(cursor=cursor, match=pattern, count=100)
                results.extend(chunk)
                if cursor == 0:
                    break
        except RedisError as exc:
            logger.error("Scanning brand queues failed", extra={"context_error": str(exc)})
        return sorted(set(results))

    async def get_spike_history(self, brand: str, cluster_id: int) -> list[int]:
        key = self._spike_key(brand, cluster_id)
        try:
            history = await self._client.lrange(key, 0, -1)
            return [int(item) for item in history]
        except RedisError as exc:
            logger.warning("Fetching spike history failed", extra={"context_error": str(exc)})
            return []

    async def append_spike_history(self, brand: str, cluster_id: int, value: int) -> None:
        key = self._spike_key(brand, cluster_id)
        try:
            async with self._lock:
                pipe = self._client.pipeline()
                pipe.lpush(key, value)
                pipe.ltrim(key, 0, 99)
                pipe.expire(key, self._settings.spike_history_ttl_sec)
                await pipe.execute()
        except RedisError as exc:
            logger.warning("Updating spike history failed", extra={"context_error": str(exc)})

    def _spike_key(self, brand: str, cluster_id: int) -> str:
        return f"{self._settings.redis_spike_prefix}:{brand}:{cluster_id}"

    async def close(self) -> None:
        await self._client.close()
