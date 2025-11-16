"""LLM adapter abstractions for summaries and sentiment."""
from __future__ import annotations

import asyncio
import json
import logging
import time
from contextlib import contextmanager
from typing import Any, Protocol

from langchain_core.prompts import PromptTemplate
from langchain_core.runnables import Runnable
from langchain_openai import ChatOpenAI

from .config import get_settings
from .logger import get_logger, log_with_context
from .metrics import worker_llm_latency_seconds
from .llm_executor import invoke_general, invoke_prompt_text, invoke_roadmap

logger = get_logger(__name__)


SUMMARY_PROMPT = PromptTemplate.from_template(
    """You are an analyst summarizing brand mentions.
Summarize the following texts into a concise overview (max {max_tokens} tokens).
Texts:\n{joined_texts}\n"""
)

SENTIMENT_PROMPT = PromptTemplate.from_template(
    """You are a sentiment analysis assistant. Analyse the sentiment of the texts below and return a JSON object with keys positive, negative, neutral whose values are floats between 0 and 1 summing to 1.
Texts:\n{joined_texts}\n"""
)


class SupportsInvoke(Protocol):
    async def ainvoke(self, input: Any) -> Any:  # pragma: no cover - protocol definition
        ...


class MockLLM(SupportsInvoke):
    """Simple in-memory LLM used for tests and local development."""

    async def ainvoke(self, input: Any) -> Any:  # pragma: no cover - deterministic behaviour
        if isinstance(input, dict):
            payload = input.get("input", "")
        else:
            payload = input or ""
        text = str(payload)
        summary = text.split("\n")[0][:160] if text else ""
        if "Analyse the sentiment" in text:
            body = text.split("Texts:\n", 1)[1] if "Texts:\n" in text else text
            lines = [line.strip() for line in body.split("\n") if line.strip()]
            if not lines:
                lines = [body.strip()] if body.strip() else []
            positive_words = {"great", "good", "love", "awesome", "excellent", "improved", "success", "fast"}
            negative_words = {"bad", "hate", "poor", "slow", "issue", "problem", "bug", "error"}
            positive = neutral = negative = 0
            for line in lines:
                lower = line.lower()
                pos_hits = sum(1 for word in positive_words if word in lower)
                neg_hits = sum(1 for word in negative_words if word in lower)
                if pos_hits > neg_hits:
                    positive += 1
                elif neg_hits > pos_hits:
                    negative += 1
                else:
                    neutral += 1
            total = positive + negative + neutral or 1
            sentiment = {
                "positive": positive / total,
                "negative": negative / total,
                "neutral": neutral / total,
            }
            return json.dumps(sentiment)
        sentiment = {
            "positive": 0.33,
            "negative": 0.33,
            "neutral": 0.34,
        }
        if "summary" in text.lower():
            return summary or "no summary available"
        return json.dumps(sentiment)


class GeminiProxy(SupportsInvoke):
    """Proxy object to signal Gemini executor usage."""

    async def ainvoke(self, input: Any) -> Any:  # pragma: no cover - executor handles actual invocation
        raise NotImplementedError("GeminiProxy should be handled via executor helpers")


class LangChainLLMAdapter:
    """Adapter that leverages LangChain chat models for summaries and sentiment."""

    def __init__(self, primary: SupportsInvoke, fallback: SupportsInvoke | None, *, max_tokens: int, timeout: int, worker_id: str) -> None:
        self._primary = primary
        self._fallback = fallback
        self._max_tokens = max_tokens
        self._timeout = timeout
        self._worker_id = worker_id
        self._brand = "unknown"
        self._chunk_id = "unknown"

    @contextmanager
    def context(self, *, brand: str, chunk_id: str) -> Any:
        previous_brand = self._brand
        previous_chunk = self._chunk_id
        self._brand = brand
        self._chunk_id = chunk_id
        try:
            yield self
        finally:
            self._brand = previous_brand
            self._chunk_id = previous_chunk

    async def summarize(self, texts: list[str]) -> str:
        prompt = SUMMARY_PROMPT.format(joined_texts="\n".join(texts), max_tokens=self._max_tokens)
        return await self._invoke(prompt, operation="summary")

    async def sentiment(self, texts: list[str]) -> dict[str, float]:
        prompt = SENTIMENT_PROMPT.format(joined_texts="\n".join(texts))
        response = await self._invoke(prompt, operation="sentiment")
        if isinstance(response, str):
            try:
                parsed = json.loads(response)
            except json.JSONDecodeError:
                parsed = {"positive": 0.33, "negative": 0.33, "neutral": 0.34}
        elif isinstance(response, dict):
            parsed = response
        else:
            parsed = {"positive": 0.33, "negative": 0.33, "neutral": 0.34}
        return {
            "positive": float(parsed.get("positive", 0.0)),
            "negative": float(parsed.get("negative", 0.0)),
            "neutral": float(parsed.get("neutral", 1.0)),
        }

    async def _invoke(self, prompt: str, *, operation: str) -> Any:
        start = time.perf_counter()
        try:
            if isinstance(self._primary, GeminiProxy):
                response = await self._invoke_via_executor(prompt, operation)
            elif isinstance(self._primary, ChatOpenAI):
                response = await asyncio.wait_for(self._primary.ainvoke(prompt), timeout=self._timeout)
            else:
                response = await asyncio.wait_for(self._primary.ainvoke(prompt), timeout=self._timeout)
        except Exception as primary_exc:
            log_with_context(
                logger,
                level=logging.WARNING,
                message="Primary LLM failed, attempting fallback",
                context={
                    "worker_id": self._worker_id,
                    "brand": self._brand,
                    "chunk_id": self._chunk_id,
                    "operation": operation,
                    "error": str(primary_exc),
                },
            )
            if self._fallback is None:
                raise
            response = await self._invoke_fallback(prompt, operation)
        duration = time.perf_counter() - start
        worker_llm_latency_seconds.labels(self._worker_id, self._brand, operation).observe(duration)
        log_with_context(
            logger,
            level=logging.INFO,
            message="LLM operation completed",
            context={
                "worker_id": self._worker_id,
                "brand": self._brand,
                "chunk_id": self._chunk_id,
                "operation": operation,
            },
            metrics={f"llm_{operation}_ms": duration * 1000},
        )
        if hasattr(response, "content"):
            return response.content
        return response

    async def _invoke_via_executor(self, prompt: str, operation: str) -> Any:
        payload = {"brand": self._brand, "chunk_id": self._chunk_id, "operation": operation}
        if operation == "summary":
            return await invoke_general(prompt, timeout=self._timeout, **payload)
        if operation == "sentiment":
            return await invoke_prompt_text(prompt, timeout=self._timeout, **payload)
        if operation == "roadmap":  # optional extended operation
            return await invoke_roadmap({}, timeout=self._timeout, **payload)
        return await invoke_general(prompt, timeout=self._timeout, **payload)

    async def _invoke_fallback(self, prompt: str, operation: str) -> Any:
        if isinstance(self._fallback, GeminiProxy):
            return await self._invoke_via_executor(prompt, operation)
        if isinstance(self._fallback, ChatOpenAI):
            return await asyncio.wait_for(self._fallback.ainvoke(prompt), timeout=self._timeout)
        return await asyncio.wait_for(self._fallback.ainvoke(prompt), timeout=self._timeout)


InstrumentedLLMAdapter = LangChainLLMAdapter


def _build_chat_models(settings):
    provider = settings.llm_provider
    if provider == "mock":
        return MockLLM(), None

    primary: SupportsInvoke | None = None
    fallback: SupportsInvoke | None = None

    if provider == "gemini":
        if not settings.gemini_api_key:
            raise ValueError("GEMINI_API_KEY must be set when LLM_PROVIDER is 'gemini'")
        primary = GeminiProxy()
        if settings.openai_api_key:
            fallback = ChatOpenAI(
                model=settings.openai_model,
                api_key=settings.openai_api_key,
                temperature=0.3,
            )
    elif provider == "openai":
        if not settings.openai_api_key:
            raise ValueError("OPENAI_API_KEY must be set when LLM_PROVIDER is 'openai'")
        primary = ChatOpenAI(
            model=settings.openai_model,
            api_key=settings.openai_api_key,
            temperature=0.3,
        )
        if settings.gemini_api_key:
            fallback = GeminiProxy()
    else:
        raise ValueError(f"Unsupported LLM provider: {provider}")

    if primary is None:
        raise ValueError("No primary LLM configured")

    if fallback is None:
        fallback = MockLLM()

    return primary, fallback


def get_llm_adapter(worker_id: str) -> LangChainLLMAdapter:
    settings = get_settings()
    primary, fallback = _build_chat_models(settings)

    if primary is None:
        raise ValueError("No LLM provider configured. Set LLM_PROVIDER to 'mock', 'gemini', or 'openai'.")

    return InstrumentedLLMAdapter(
        primary=primary,
        fallback=fallback,
        max_tokens=settings.llm_summary_max_tokens,
        timeout=settings.llm_timeout_sec,
        worker_id=worker_id,
    )
