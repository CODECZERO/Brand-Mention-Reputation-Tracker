"""Health endpoint router."""
from __future__ import annotations

from fastapi import APIRouter

from .config import get_settings

router = APIRouter()


@router.get("/health")
async def health() -> dict[str, str]:
    settings = get_settings()
    return {"status": "ok", "workerId": settings.effective_worker_id}
