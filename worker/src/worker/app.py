"""Application entry point orchestrating the worker service."""
from __future__ import annotations

import asyncio
import logging
import signal
import socket
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
from starlette.responses import Response
from uvicorn import Config, Server

try:
    from . import metrics  # noqa: F401 ensure metric registration
    from .config import get_settings
    from .health import router as health_router
    from .logger import configure_logging, get_logger, log_with_context
    from .metrics import worker_chunks_processed_total, worker_processing_time_seconds
    from .processor import ChunkProcessor
    from .queue_consumer import QueueConsumer, extract_brand_from_queue
    from .redis_client import RedisClient
    from .storage import ResultStorage
    from .types import Chunk, FailureRecord
    from .utils import safe_json_loads
except ImportError as import_error:
    if __package__ not in (None, ""):
        raise

    import pathlib
    import sys

    sys.path.append(str(pathlib.Path(__file__).resolve().parents[1]))

    from worker import metrics  # type: ignore  # noqa: F401 - ensure metric registration
    from worker.config import get_settings  # type: ignore
    from worker.health import router as health_router  # type: ignore
    from worker.logger import configure_logging, get_logger, log_with_context  # type: ignore
    from worker.metrics import worker_chunks_processed_total, worker_processing_time_seconds  # type: ignore
    from worker.processor import ChunkProcessor  # type: ignore
    from worker.queue_consumer import QueueConsumer, extract_brand_from_queue  # type: ignore
    from worker.redis_client import RedisClient  # type: ignore
    from worker.storage import ResultStorage  # type: ignore
    from worker.types import Chunk, FailureRecord  # type: ignore
    from worker.utils import safe_json_loads  # type: ignore

logger = get_logger(__name__)


class WorkerService:
    """Coordinates Redis consumption, processing, and result persistence."""

    def __init__(self) -> None:
        self._settings = get_settings()
        self._worker_id = self._settings.effective_worker_id
        self._redis = RedisClient(self._settings.redis_url)
        self._queue_consumer = QueueConsumer(self._redis, self._worker_id)
        self._processor = ChunkProcessor(self._worker_id, self._redis)
        self._storage = ResultStorage(self._redis, self._worker_id)
        self._stop_event = asyncio.Event()
        self._tasks: list[asyncio.Task[Any]] = []

    async def start(self) -> None:
        await self._redis.ensure_connection()
        self._stop_event.clear()
        self._tasks = [
            asyncio.create_task(self._heartbeat_loop(), name="heartbeat"),
            asyncio.create_task(self._processing_loop(), name="processing"),
        ]
        log_with_context(
            logger,
            level=logging.INFO,
            message="Worker service started",
            context={"worker_id": self._worker_id},
        )

    async def stop(self) -> None:
        self._stop_event.set()
        for task in self._tasks:
            task.cancel()
        await asyncio.gather(*self._tasks, return_exceptions=True)
        self._tasks.clear()
        await self._redis.close()
        log_with_context(
            logger,
            level=logging.INFO,
            message="Worker service stopped",
            context={"worker_id": self._worker_id},
        )

    async def _heartbeat_loop(self) -> None:
        interval = max(self._settings.heartbeat_interval_sec, 1)
        try:
            while not self._stop_event.is_set():
                await self._redis.set_heartbeat(self._worker_id, interval)
                try:
                    await asyncio.wait_for(self._stop_event.wait(), timeout=interval)
                except asyncio.TimeoutError:
                    continue
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # pragma: no cover - defensive logging
            logger.exception("Heartbeat loop error", extra={"context_error": str(exc)})

    async def _processing_loop(self) -> None:
        try:
            while not self._stop_event.is_set():
                fetch = await self._queue_consumer.fetch()
                if fetch is None:
                    continue
                queue_key, payload, fetch_time_ms = fetch
                await self._handle_payload(queue_key, payload, fetch_time_ms)
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # pragma: no cover
            logger.exception("Processing loop error", extra={"context_error": str(exc)})

    async def _handle_payload(self, queue_key: str, payload: str, fetch_time_ms: float) -> None:
        brand_hint = extract_brand_from_queue(queue_key)
        try:
            raw_data = safe_json_loads(payload)
        except ValueError as exc:
            await self._record_failure(brand_hint, "json_decode", "Invalid JSON", payload, str(exc))
            return

        try:
            chunk = Chunk.model_validate(raw_data)
        except Exception as exc:
            chunk_id = raw_data.get("chunkId", "unknown") if isinstance(raw_data, dict) else "unknown"
            await self._record_failure(brand_hint, "validation", "Validation failed", payload, str(exc), chunk_id=chunk_id)
            return

        chunk_brand = chunk.brand or brand_hint
        try:
            result = await self._processor.process_chunk(chunk, fetch_time_ms=fetch_time_ms)
            push_time_ms = await self._storage.push_result(chunk_brand, result)
            result.metrics.io_time_ms += push_time_ms
            worker_processing_time_seconds.labels(self._worker_id, chunk_brand).observe(
                result.metrics.total_task_time_ms / 1000
            )
            worker_chunks_processed_total.labels(self._worker_id, chunk_brand).inc()
        except Exception as exc:
            await self._record_failure(
                chunk_brand,
                "processing",
                "Processing failed",
                payload,
                str(exc),
                chunk_id=chunk.chunk_id,
            )

    async def _record_failure(
        self,
        brand: str,
        reason_key: str,
        message: str,
        payload: str,
        error_detail: str,
        *,
        chunk_id: str = "unknown",
    ) -> None:
        reason = f"{reason_key}:{error_detail}"
        failure = FailureRecord(
            worker_id=self._worker_id,
            brand=brand,
            chunk_id=chunk_id,
            reason=message,
            payload=payload,
        )
        await self._storage.record_failure(brand, failure, reason_label=reason_key)
        log_with_context(
            logger,
            level=logging.WARNING,
            message="Chunk processing failure",
            context={
                "worker_id": self._worker_id,
                "brand": brand,
                "chunk_id": chunk_id,
                "reason": reason,
            },
            metrics={"failure": 1},
        )


service_instance: WorkerService | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global service_instance
    configure_logging(get_settings().log_level)
    service_instance = WorkerService()
    await service_instance.start()
    try:
        yield
    finally:
        if service_instance:
            await service_instance.stop()
            service_instance = None


def create_app() -> FastAPI:
    app = FastAPI(lifespan=lifespan, title="Service 3 Worker")
    app.include_router(health_router)

    @app.get("/metrics")
    async def metrics_view() -> Response:
        payload = generate_latest()
        return Response(content=payload, media_type=CONTENT_TYPE_LATEST)

    return app


async def _serve(app: FastAPI, host: str, port: int, stop_event: asyncio.Event) -> None:
    config = Config(app=app, host=host, port=port, loop="asyncio", lifespan="on")
    server = Server(config)
    server_finished = asyncio.create_task(server.serve())
    await stop_event.wait()
    server.should_exit = True
    await server_finished


def _choose_available_port(preferred_port: int) -> int:
    """Return the preferred port if free, otherwise an ephemeral alternative."""

    if _port_available(preferred_port):
        return preferred_port

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as temp_socket:
        temp_socket.bind(("0.0.0.0", 0))
        _, port = temp_socket.getsockname()
    return int(port)


def _port_available(port: int) -> bool:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as temp_socket:
            temp_socket.bind(("0.0.0.0", port))
        return True
    except OSError:
        return False


def run() -> None:
    settings = get_settings()
    configure_logging(settings.log_level)
    chosen_port = _choose_available_port(settings.http_port)
    if chosen_port != settings.http_port:
        log_with_context(
            logger,
            level=logging.WARNING,
            message="Configured HTTP port unavailable; using fallback",
            context={"requested_port": settings.http_port, "fallback_port": chosen_port},
        )
    app = create_app()

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    stop_event = asyncio.Event()

    def _signal_handler(*_: int) -> None:
        log_with_context(
            logger,
            level=logging.INFO,
            message="Shutdown signal received",
            context={"worker_id": settings.effective_worker_id},
        )
        loop.call_soon_threadsafe(stop_event.set)

    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, _signal_handler)

    async def main() -> None:
        await _serve(app, "0.0.0.0", chosen_port, stop_event)

    try:
        loop.run_until_complete(main())
    finally:
        loop.run_until_complete(loop.shutdown_asyncgens())
        loop.close()


if __name__ == "__main__":
    run()
