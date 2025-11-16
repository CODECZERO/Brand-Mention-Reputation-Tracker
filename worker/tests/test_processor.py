"""Tests for the chunk processor pipeline."""
from __future__ import annotations

import os
import pathlib
import sys
from datetime import datetime, timezone

import pytest

PROJECT_ROOT = pathlib.Path(__file__).resolve().parents[1]
SRC_PATH = PROJECT_ROOT / "src"
if str(SRC_PATH) not in sys.path:
    sys.path.insert(0, str(SRC_PATH))

os.environ.setdefault("LLM_PROVIDER", "mock")

from worker import config as worker_config  # type: ignore
from worker.processor import ChunkProcessor  # type: ignore
from worker.types import Chunk, Mention  # type: ignore


class StubRedis:
    """Minimal Redis client stub for spike detection calls."""

    def __init__(self) -> None:
        self.history: dict[tuple[str, int], list[int]] = {}

    async def get_spike_history(self, brand: str, cluster_id: int) -> list[int]:
        return self.history.get((brand, cluster_id), [])

    async def append_spike_history(self, brand: str, cluster_id: int, value: int) -> None:
        self.history.setdefault((brand, cluster_id), []).append(value)


@pytest.fixture(autouse=True)
def _reset_settings_cache() -> None:
    worker_config.get_settings.cache_clear()
    yield
    worker_config.get_settings.cache_clear()


@pytest.mark.asyncio
async def test_process_chunk_returns_clusters_and_metrics() -> None:
    worker_id = "worker-test"
    processor = ChunkProcessor(worker_id, StubRedis())

    chunk = Chunk(
        brand="nike",
        chunkId="chunk-123",
        createdAt=datetime.now(timezone.utc),
        mentions=[
            Mention(id="m1", source="x", text="Love the new shoes!", created_at=datetime.now(timezone.utc)),
            Mention(id="m2", source="reddit", text="These shoes are amazing", created_at=datetime.now(timezone.utc)),
            Mention(id="m3", source="x", text="I hate the laces", created_at=datetime.now(timezone.utc)),
        ],
    )

    result = await processor.process_chunk(chunk, fetch_time_ms=12.5)

    assert result.brand == chunk.brand
    assert result.chunk_id == chunk.chunk_id
    assert result.metrics.io_time_ms >= 12.5
    assert result.metrics.total_task_time_ms >= result.metrics.io_time_ms
    assert result.metrics.embedding_time_ms >= 0
    assert result.metrics.clustering_time_ms >= 0
    assert result.metrics.llm_time_ms >= 0
    assert result.metrics.spike_detection_time_ms >= 0
    assert len(result.clusters) >= 1
    for cluster in result.clusters:
        assert isinstance(cluster.summary, str) or cluster.summary is None
        assert cluster.count >= 1
        assert set(cluster.sentiment.keys()) == {"positive", "negative", "neutral"}
