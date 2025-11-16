"""Clustering utilities for grouping mentions."""
from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass
from typing import Dict, Iterable, List, Sequence

import numpy as np
from sklearn.cluster import KMeans

from .logger import get_logger, log_with_context
from .metrics import worker_clustering_time_seconds

logger = get_logger(__name__)

try:  # pragma: no cover - optional dependency
    import hdbscan  # type: ignore
except Exception:  # pragma: no cover - fallback when unavailable
    hdbscan = None  # type: ignore


@dataclass
class ClusterGrouping:
    cluster_id: int
    indices: list[int]
    method: str


@dataclass
class ClusteringOutput:
    clusters: list[ClusterGrouping]
    method: str
    duration_ms: float


class Clusterer:
    """Performs clustering using HDBSCAN with KMeans fallback."""

    def __init__(self, worker_id: str) -> None:
        self._worker_id = worker_id

    async def cluster(self, embeddings: np.ndarray, *, brand: str, chunk_id: str) -> ClusteringOutput:
        if embeddings.size == 0:
            return ClusteringOutput(clusters=[], method="empty", duration_ms=0.0)
        if embeddings.shape[0] == 1:
            grouping = ClusterGrouping(cluster_id=0, indices=[0], method="singleton")
            return ClusteringOutput(clusters=[grouping], method="singleton", duration_ms=0.0)

        start = time.perf_counter()
        method = "hdbscan" if hdbscan is not None and embeddings.shape[0] >= 5 else "kmeans"

        if method == "hdbscan":
            labels = await self._run_hdbscan(embeddings)
        else:
            labels = await self._run_kmeans(embeddings)
            method = "kmeans"

        duration_ms = (time.perf_counter() - start) * 1000
        worker_clustering_time_seconds.labels(self._worker_id, brand).observe(duration_ms / 1000)
        clusters = self._group_labels(labels)

        log_with_context(
            logger,
            level=logging.INFO,
            message="Clustering completed",
            context={
                "worker_id": self._worker_id,
                "brand": brand,
                "chunk_id": chunk_id,
                "method": method,
                "clusters": len(clusters),
            },
            metrics={"clustering_time_ms": duration_ms},
        )

        return ClusteringOutput(clusters=clusters, method=method, duration_ms=duration_ms)

    async def _run_hdbscan(self, embeddings: np.ndarray) -> np.ndarray:
        min_cluster_size = max(2, embeddings.shape[0] // 10)
        clusterer = hdbscan.HDBSCAN(min_cluster_size=min_cluster_size or 2)  # type: ignore[attr-defined]
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, clusterer.fit_predict, embeddings)

    async def _run_kmeans(self, embeddings: np.ndarray) -> np.ndarray:
        n_samples = embeddings.shape[0]
        k = max(2, min(8, max(2, n_samples // 20)))
        k = min(k, n_samples - 1) if n_samples > 1 else 1
        if k <= 0:
            k = 1
        kmeans = KMeans(n_clusters=k, n_init="auto", random_state=42)
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, lambda: kmeans.fit_predict(embeddings))

    def _group_labels(self, labels: np.ndarray) -> list[ClusterGrouping]:
        clusters: Dict[int, list[int]] = {}
        next_cluster_id = 0
        for idx, label in enumerate(labels):
            if label == -1:
                clusters[next_cluster_id] = [idx]
                next_cluster_id += 1
                continue
            clusters.setdefault(int(label), []).append(idx)
        grouped = [ClusterGrouping(cluster_id=i, indices=sorted(indices), method="cluster") for i, indices in enumerate(clusters.values())]
        return grouped
