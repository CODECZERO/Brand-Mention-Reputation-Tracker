"""Storage utilities for persisting results back to Redis."""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List

from .config import get_settings
from .logger import get_logger, log_with_context
from .metrics import worker_chunks_failed_total, worker_io_time_seconds
from .redis_client import RedisClient
from .types import ChunkResult, ClusterResult, FailureRecord
from .utils import timer

logger = get_logger(__name__)


class ResultStorage:
    """Store chunk results and failures in Redis with instrumentation."""

    def __init__(self, redis_client: RedisClient, worker_id: str) -> None:
        self._redis = redis_client
        self._settings = get_settings()
        self._worker_id = worker_id

    async def push_result(self, brand: str, result: ChunkResult) -> float:
        key = f"{self._settings.redis_result_prefix}:{brand}:chunks"
        payload = json.dumps(self._format_for_orchestrator(result))
        with timer() as timing:
            await self._redis.rpush(key, payload)
        elapsed_ms = timing["elapsed_ms"]
        worker_io_time_seconds.labels(self._worker_id, brand, "push").observe(elapsed_ms / 1000)
        log_with_context(
            logger,
            level=logging.INFO,
            message="Result pushed to Redis",
            context={
                "worker_id": self._worker_id,
                "brand": brand,
                "key": key,
                "chunk_id": result.chunk_id,
            },
            metrics={"push_time_ms": elapsed_ms},
        )
        return elapsed_ms

    def _format_for_orchestrator(self, result: ChunkResult) -> Dict[str, Any]:
        clusters_payload = self._build_clusters(result.clusters)
        sentiment = self._aggregate_sentiment(result.clusters)
        topics = self._extract_topics(result.clusters)
        spike_detected = any(cluster.get("spike", False) for cluster in clusters_payload)
        mention_count = sum(cluster["mentionCount"] for cluster in clusters_payload)

        return {
            "chunkId": result.chunk_id,
            "brand": result.brand,
            "processedAt": datetime.now(timezone.utc).isoformat(),
            "sentiment": sentiment,
            "clusters": clusters_payload,
            "topics": topics,
            "summary": self._combine_summaries(result.clusters),
            "spikeDetected": spike_detected,
            "meta": {
                "metrics": result.metrics.model_dump(),
                "mentionCount": mention_count,
            },
        }

    def _build_clusters(self, clusters: List[ClusterResult]) -> List[Dict[str, Any]]:
        cluster_payload: List[Dict[str, Any]] = []
        for cluster in clusters:
            sentiment = cluster.sentiment or {}
            sentiment_score = float(sentiment.get("positive", 0.0)) - float(sentiment.get("negative", 0.0))
            label = self._normalize_summary_text(cluster.summary, cluster.examples, fallback_label=f"Cluster {cluster.cluster_id}")
            cluster_payload.append(
                {
                    "id": str(cluster.cluster_id),
                    "label": label,
                    "mentions": cluster.examples,
                    "sentimentScore": sentiment_score,
                    "spike": cluster.spike,
                    "mentionCount": cluster.count,
                }
            )
        return cluster_payload

    def _aggregate_sentiment(self, clusters: List[ClusterResult]) -> Dict[str, float]:
        totals = {"positive": 0.0, "neutral": 0.0, "negative": 0.0}
        counted = 0
        for cluster in clusters:
            if not cluster.sentiment:
                continue
            counted += 1
            totals["positive"] += float(cluster.sentiment.get("positive", 0.0))
            totals["neutral"] += float(cluster.sentiment.get("neutral", 0.0))
            totals["negative"] += float(cluster.sentiment.get("negative", 0.0))

        if counted > 0:
            for key in totals:
                totals[key] /= counted

        totals["score"] = totals["positive"] - totals["negative"]
        return totals

    def _extract_topics(self, clusters: List[ClusterResult]) -> List[str]:
        topics: List[str] = []
        for cluster in clusters:
            normalized = self._normalize_summary_text(cluster.summary, cluster.examples)
            if normalized:
                topics.append(normalized)
            elif cluster.examples:
                topics.extend(cluster.examples[:1])
        return [topic.strip() for topic in topics if topic.strip()][:10]

    def _combine_summaries(self, clusters: List[ClusterResult]) -> str:
        lines: List[str] = []
        for cluster in clusters:
            normalized = self._normalize_summary_text(cluster.summary, cluster.examples)
            if normalized:
                lines.append(normalized)
        if not lines:
            return ""
        return " ".join(lines)

    def _normalize_summary_text(self, summary: str | None, examples: List[str], *, fallback_label: str | None = None) -> str:
        candidate = (summary or "").strip()
        if candidate.startswith("{") and candidate.endswith("}") and "positive" in candidate and "negative" in candidate:
            candidate = ""
        if not candidate and examples:
            candidate = examples[0].strip()
        if not candidate and fallback_label:
            candidate = fallback_label
        return candidate

    async def record_failure(self, brand: str, failure: FailureRecord, *, reason_label: str) -> float:
        key = f"{self._settings.redis_failed_prefix}:{brand}"
        payload = failure.model_dump_json()
        with timer() as timing:
            await self._redis.record_failure(key, payload)
        elapsed_ms = timing["elapsed_ms"]
        worker_chunks_failed_total.labels(self._worker_id, brand, reason_label).inc()
        worker_io_time_seconds.labels(self._worker_id, brand, "failure").observe(elapsed_ms / 1000)
        log_with_context(
            logger,
            level=logging.WARNING,
            message="Failure recorded",
            context={
                "worker_id": self._worker_id,
                "brand": brand,
                "chunk_id": failure.chunk_id,
                "reason": failure.reason,
            },
            metrics={"failure_record_time_ms": elapsed_ms},
        )
        return elapsed_ms
