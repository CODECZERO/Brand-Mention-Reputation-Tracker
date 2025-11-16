"""Spike detection utilities leveraging Redis history."""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass

from .logger import get_logger, log_with_context
from .metrics import worker_spike_detection_seconds
from .redis_client import RedisClient

logger = get_logger(__name__)


@dataclass
class SpikeResult:
    is_spike: bool
    historical_average: float
    current_count: int


class SpikeDetector:
    """Detects spikes in cluster mention counts using historical data."""

    def __init__(self, redis_client: RedisClient, worker_id: str) -> None:
        self._redis = redis_client
        self._worker_id = worker_id

    async def detect(self, brand: str, cluster_id: int, current_count: int) -> SpikeResult:
        start = time.perf_counter()
        history = await self._redis.get_spike_history(brand, cluster_id)
        historical_average = sum(history) / len(history) if history else 0.0
        threshold = max(10, historical_average * 2)
        is_spike = current_count > threshold
        await self._redis.append_spike_history(brand, cluster_id, current_count)
        duration = time.perf_counter() - start
        worker_spike_detection_seconds.labels(self._worker_id, brand).observe(duration)
        log_with_context(
            logger,
            level=logging.INFO,
            message="Spike detection evaluated",
            context={
                "worker_id": self._worker_id,
                "brand": brand,
                "cluster_id": cluster_id,
                "history": history,
            },
            metrics={
                "spike_detection_ms": duration * 1000,
                "historical_average": historical_average,
                "current_count": current_count,
                "spike": int(is_spike),
            },
        )
        return SpikeResult(is_spike=is_spike, historical_average=historical_average, current_count=current_count)
