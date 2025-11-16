"""Processing pipeline coordinating preprocessing, embeddings, clustering, LLM, and spike detection."""
from __future__ import annotations

import logging
import re
import time

import numpy as np

from .config import get_settings
from .embeddings import InstrumentedEmbeddingAdapter, get_embedding_adapter
from .clustering import Clusterer, ClusteringOutput
from .llm_adapter import InstrumentedLLMAdapter, get_llm_adapter
from .logger import get_logger, log_with_context
from .metrics import (
    worker_preprocessing_time_seconds,
)
from .spike_detector import SpikeDetector
from .types import Chunk, ChunkMetrics, ChunkResult, ClusterResult, Mention

logger = get_logger(__name__)


CLEAN_URL_RE = re.compile(r"https?://\S+")
CLEAN_WHITESPACE_RE = re.compile(r"\s+")


class ChunkProcessor:
    """Main processing pipeline for a chunk of mentions."""

    def __init__(
        self,
        worker_id: str,
        redis_client,
    ) -> None:
        self._settings = get_settings()
        self._worker_id = worker_id
        self._embedding_adapter: InstrumentedEmbeddingAdapter = get_embedding_adapter(worker_id)
        self._llm_adapter: InstrumentedLLMAdapter = get_llm_adapter(worker_id)
        self._clusterer = Clusterer(worker_id)
        self._spike_detector = SpikeDetector(redis_client, worker_id)

    async def process_chunk(self, chunk: Chunk, *, fetch_time_ms: float) -> ChunkResult:
        metrics = ChunkMetrics(io_time_ms=fetch_time_ms)
        total_start = time.perf_counter()

        with self._llm_adapter.context(brand=chunk.brand, chunk_id=chunk.chunk_id):
            mentions = self._preprocess(chunk, metrics)
            if not mentions:
                processing_ms = (time.perf_counter() - total_start) * 1000
                metrics.total_task_time_ms = processing_ms + metrics.io_time_ms
                return ChunkResult(
                    chunk_id=chunk.chunk_id,
                    brand=chunk.brand,
                    timestamp=int(chunk.created_at.timestamp()),
                    clusters=[],
                    metrics=metrics,
                )

            embeddings, embed_duration = await self._generate_embeddings(chunk, mentions)
            metrics.embedding_time_ms = embed_duration

            clustering_output = await self._perform_clustering(chunk, embeddings)
            metrics.clustering_time_ms = clustering_output.duration_ms

            clusters = await self._analyze_clusters(chunk, mentions, clustering_output, metrics)

        processing_ms = (time.perf_counter() - total_start) * 1000
        metrics.total_task_time_ms = processing_ms + metrics.io_time_ms
        log_with_context(
            logger,
            level=logging.INFO,
            message="Chunk processed",
            context={
                "worker_id": self._worker_id,
                "brand": chunk.brand,
                "chunk_id": chunk.chunk_id,
                "mentions": len(mentions),
                "clusters": len(clusters),
            },
            metrics=metrics.model_dump(),
        )

        return ChunkResult(
            chunk_id=chunk.chunk_id,
            brand=chunk.brand,
            timestamp=int(chunk.created_at.timestamp()),
            clusters=clusters,
            metrics=metrics,
        )

    def _preprocess(self, chunk: Chunk, metrics: ChunkMetrics) -> list[Mention]:
        start = time.perf_counter()
        dedup: dict[str, Mention] = {}
        for mention in chunk.mentions:
            cleaned = self._clean_text(mention.text)
            if not cleaned:
                continue
            if cleaned in dedup:
                continue
            dedup[cleaned] = Mention(
                id=mention.id,
                source=mention.source,
                text=cleaned,
                created_at=mention.created_at,
                sentiment=mention.sentiment,
                metadata=mention.metadata,
            )
        duration = time.perf_counter() - start
        metrics.preprocessing_time_ms = duration * 1000
        worker_preprocessing_time_seconds.labels(self._worker_id, chunk.brand).observe(duration)
        log_with_context(
            logger,
            level=logging.INFO,
            message="Preprocessing completed",
            context={
                "worker_id": self._worker_id,
                "brand": chunk.brand,
                "chunk_id": chunk.chunk_id,
                "original_mentions": len(chunk.mentions),
                "clean_mentions": len(dedup),
            },
            metrics={"preprocessing_time_ms": metrics.preprocessing_time_ms},
        )
        return list(dedup.values())

    async def _generate_embeddings(self, chunk: Chunk, mentions: list[Mention]) -> tuple[np.ndarray, float]:
        start = time.perf_counter()
        embeddings = await self._embedding_adapter.embed(
            [m.text for m in mentions],
            brand=chunk.brand,
            chunk_id=chunk.chunk_id,
        )
        duration = (time.perf_counter() - start) * 1000
        return embeddings, duration

    async def _perform_clustering(self, chunk: Chunk, embeddings: np.ndarray) -> ClusteringOutput:
        return await self._clusterer.cluster(embeddings, brand=chunk.brand, chunk_id=chunk.chunk_id)

    async def _analyze_clusters(
        self,
        chunk: Chunk,
        mentions: list[Mention],
        clustering_output: ClusteringOutput,
        metrics: ChunkMetrics,
    ) -> list[ClusterResult]:
        brand = chunk.brand
        chunk_id = chunk.chunk_id
        clusters: list[ClusterResult] = []
        llm_total_ms = 0.0
        spike_total_ms = 0.0

        for grouping in clustering_output.clusters:
            cluster_mentions = [mentions[idx] for idx in grouping.indices]
            texts = [mention.text for mention in cluster_mentions]
            examples = [mention.text for mention in cluster_mentions[: self._settings.preprocessing_examples]]

            cluster_start = time.perf_counter()
            summary = await self._llm_adapter.summarize(texts)
            sentiment = await self._llm_adapter.sentiment(texts)
            llm_total_ms += (time.perf_counter() - cluster_start) * 1000

            spike_start = time.perf_counter()
            spike_result = await self._spike_detector.detect(brand, grouping.cluster_id, len(cluster_mentions))
            spike_total_ms += (time.perf_counter() - spike_start) * 1000

            clusters.append(
                ClusterResult(
                    cluster_id=grouping.cluster_id,
                    count=len(cluster_mentions),
                    examples=examples,
                    summary=summary,
                    spike=spike_result.is_spike,
                    sentiment=sentiment,
                )
            )

        metrics.llm_time_ms = llm_total_ms
        metrics.spike_detection_time_ms = spike_total_ms
        return clusters

    @staticmethod
    def _clean_text(text: str) -> str:
        text = CLEAN_URL_RE.sub("", text)
        text = CLEAN_WHITESPACE_RE.sub(" ", text)
        text = text.strip().lower()
        return text
