"""Embeddings provider with instrumentation."""
from __future__ import annotations

import asyncio
import hashlib
import logging
import time
from abc import ABC, abstractmethod
from typing import Sequence

import numpy as np

from .config import get_settings
from .logger import get_logger, log_with_context
from .metrics import worker_embedding_time_seconds

logger = get_logger(__name__)

try:
    from sentence_transformers import SentenceTransformer  # type: ignore
except Exception:  # pragma: no cover - optional dependency fallback
    SentenceTransformer = None  # type: ignore


class EmbeddingAdapter(ABC):
    """Abstract embedding adapter interface."""

    @abstractmethod
    async def embed(self, texts: Sequence[str], *, brand: str, chunk_id: str) -> np.ndarray:
        raise NotImplementedError


class LocalEmbeddingAdapter(EmbeddingAdapter):
    """Embedding adapter using a local sentence-transformers model with graceful fallback."""

    _model: SentenceTransformer | None = None

    def __init__(self, model_name: str = "sentence-transformers/all-MiniLM-L6-v2", fallback_dim: int = 384) -> None:
        self._model_name = model_name
        self._dim = fallback_dim
        self._use_fallback = SentenceTransformer is None
        if self._use_fallback:
            log_with_context(
                logger,
                level=logging.WARNING,
                message="sentence-transformers not installed, using hash-based embedding fallback",
                context={"model": model_name},
            )

    async def _load_model(self) -> SentenceTransformer | None:
        if self._use_fallback:
            return None
        if self._model is None:
            loop = asyncio.get_running_loop()
            self._model = await loop.run_in_executor(None, SentenceTransformer, self._model_name)
        return self._model

    async def embed(self, texts: Sequence[str], *, brand: str, chunk_id: str) -> np.ndarray:
        if self._use_fallback:
            return self._hash_embed(texts)
        model = await self._load_model()
        assert model is not None  # for mypy
        loop = asyncio.get_running_loop()
        func = lambda: model.encode(list(texts), show_progress_bar=False, convert_to_numpy=True)
        return await loop.run_in_executor(None, func)

    def _hash_embed(self, texts: Sequence[str]) -> np.ndarray:
        vectors = np.zeros((len(texts), self._dim), dtype=float)
        for idx, text in enumerate(texts):
            digest = hashlib.sha256(text.encode("utf-8")).digest()
            repeat_factor = (self._dim + len(digest) - 1) // len(digest)
            repeated = (digest * repeat_factor)[: self._dim]
            vectors[idx] = np.frombuffer(repeated, dtype=np.uint8) / 255.0
        return vectors


class RemoteEmbeddingAdapter(EmbeddingAdapter):
    """Placeholder remote embedding adapter."""

    def __init__(self, provider: str) -> None:
        self._provider = provider

    async def embed(self, texts: Sequence[str], *, brand: str, chunk_id: str) -> np.ndarray:  # noqa: D401
        log_with_context(
            logger,
            level=logging.WARNING,
            message="Remote embedding provider not implemented; returning zeros",
            context={"provider": self._provider, "texts": len(texts), "brand": brand, "chunk_id": chunk_id},
        )
        return np.zeros((len(texts), 384))


class InstrumentedEmbeddingAdapter(EmbeddingAdapter):
    """Wraps an embedding adapter to emit metrics and structured logs."""

    def __init__(self, delegate: EmbeddingAdapter, worker_id: str) -> None:
        self._delegate = delegate
        self._worker_id = worker_id

    async def embed(self, texts: Sequence[str], *, brand: str, chunk_id: str) -> np.ndarray:
        start = time.perf_counter()
        embeddings = await self._delegate.embed(texts, brand=brand, chunk_id=chunk_id)
        duration = time.perf_counter() - start
        worker_embedding_time_seconds.labels(self._worker_id, brand).observe(duration)
        log_with_context(
            logger,
            level=logging.INFO,
            message="Embeddings generated",
            context={
                "worker_id": self._worker_id,
                "brand": brand,
                "chunk_id": chunk_id,
                "texts": len(texts),
            },
            metrics={"embedding_time_ms": duration * 1000},
        )
        return embeddings


def get_embedding_adapter(worker_id: str) -> InstrumentedEmbeddingAdapter:
    settings = get_settings()
    provider = settings.embeddings_provider

    if provider == "local":
        delegate: EmbeddingAdapter = LocalEmbeddingAdapter()
    else:
        delegate = RemoteEmbeddingAdapter(provider)

    return InstrumentedEmbeddingAdapter(delegate, worker_id)
