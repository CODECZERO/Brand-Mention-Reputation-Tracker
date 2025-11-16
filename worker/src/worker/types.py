"""Pydantic models shared across the worker."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class Mention(BaseModel):
    id: str
    source: str
    text: str
    created_at: datetime
    sentiment: dict[str, float] | None = None
    metadata: dict[str, Any] | None = None


class ChunkMeta(BaseModel):
    chunk_index: int | None = Field(default=None, alias="chunkIndex")
    total_chunks: int | None = Field(default=None, alias="totalChunks")

    class Config:
        populate_by_name = True


class Chunk(BaseModel):
    brand: str
    chunk_id: str = Field(alias="chunkId")
    created_at: datetime = Field(alias="createdAt")
    mentions: list[Mention]
    meta: ChunkMeta | None = None

    class Config:
        populate_by_name = True


class ClusterResult(BaseModel):
    cluster_id: int
    count: int
    examples: list[str]
    summary: str | None
    spike: bool
    sentiment: dict[str, float]
    topics: list[str] | None = None


class ChunkMetrics(BaseModel):
    preprocessing_time_ms: float = 0.0
    embedding_time_ms: float = 0.0
    clustering_time_ms: float = 0.0
    llm_time_ms: float = 0.0
    spike_detection_time_ms: float = 0.0
    io_time_ms: float = 0.0
    total_task_time_ms: float = 0.0


class ChunkResult(BaseModel):
    chunk_id: str
    brand: str
    timestamp: int
    clusters: list[ClusterResult]
    metrics: ChunkMetrics


class FailureRecord(BaseModel):
    worker_id: str
    brand: str
    chunk_id: str
    reason: str
    payload: str
