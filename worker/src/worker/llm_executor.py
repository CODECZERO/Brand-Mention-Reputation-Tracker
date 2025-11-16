"""Shared Google Gemini client utilities with concurrency control."""
from __future__ import annotations

import asyncio
import logging
from typing import Any, Dict

from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings

from .config import get_settings
from .logger import get_logger, log_with_context

logger = get_logger(__name__)

GENERAL_PROMPT = ChatPromptTemplate.from_messages(
    [
        ("system", "You are a helpful assistant. Provide a concise answer."),
        ("user", "{data}"),
    ]
)

ROADMAP_PROMPT = ChatPromptTemplate.from_messages(
    [
        (
            "system",
            "You are a career guidance expert. Generate a detailed 5-year roadmap based on the following student profile. Respond in roadmap.sh style bullet points only.",
        ),
        (
            "user",
            """
            Student Profile:
            Interests: {interests}
            Skills: {skills}
            Goal: {goal}
            """,
        ),
    ]
)

DEFAULT_PROMPT = ChatPromptTemplate.from_messages([("user", "{input}")])

_parser = StrOutputParser()

_chat_model: ChatGoogleGenerativeAI | None = None
_embeddings_model: GoogleGenerativeAIEmbeddings | None = None
_semaphore: asyncio.Semaphore | None = None
_min_delay: float = 0.0


def _ensure_clients() -> tuple[ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings, asyncio.Semaphore, float]:
    global _chat_model, _embeddings_model, _semaphore, _min_delay
    if _chat_model is None or _embeddings_model is None or _semaphore is None:
        settings = get_settings()
        if not settings.gemini_api_key:
            raise ValueError("GEMINI_API_KEY must be set when using the Gemini LLM provider")

        _chat_model = ChatGoogleGenerativeAI(
            model=settings.gemini_model,
            google_api_key=settings.gemini_api_key,
            api_version=settings.gemini_api_version,
            temperature=0.3,
        )
        _embeddings_model = GoogleGenerativeAIEmbeddings(
            model="models/text-embedding-004",
            google_api_key=settings.gemini_api_key,
        )
        _semaphore = asyncio.Semaphore(settings.llm_max_concurrency)
        _min_delay = max(0.0, settings.llm_min_delay_sec)
        log_with_context(
            logger,
            level=logging.INFO,
            message="Initialized shared Gemini clients",
            context={
                "model": settings.gemini_model,
                "api_version": settings.gemini_api_version,
                "max_concurrency": settings.llm_max_concurrency,
                "min_delay_sec": _min_delay,
            },
        )
    return _chat_model, _embeddings_model, _semaphore, _min_delay


async def _run_chain(chain, variables: Dict[str, Any], *, timeout: int, brand: str, chunk_id: str, operation: str) -> Any:
    chat, _embeddings, semaphore, min_delay = _ensure_clients()
    del chat  # chat already baked into chain
    async with semaphore:
        loop = asyncio.get_running_loop()

        def _invoke() -> Any:
            return chain.invoke(variables)

        try:
            result = await asyncio.wait_for(loop.run_in_executor(None, _invoke), timeout=timeout)
            if min_delay > 0:
                await asyncio.sleep(min_delay)
            return result
        except Exception as exc:  # pragma: no cover - upstream handler logs details
            log_with_context(
                logger,
                level=logging.WARNING,
                message="Gemini invocation failed",
                context={"brand": brand, "chunk_id": chunk_id, "operation": operation},
                metrics={"timeout_sec": timeout},
            )
            raise


async def invoke_prompt_text(prompt: str, *, timeout: int, brand: str, chunk_id: str, operation: str) -> str:
    chat, _, _ = _ensure_clients()
    chain = DEFAULT_PROMPT | chat | _parser
    return await _run_chain(chain, {"input": prompt}, timeout=timeout, brand=brand, chunk_id=chunk_id, operation=operation)


async def invoke_general(data: str, *, timeout: int, brand: str, chunk_id: str, operation: str) -> str:
    chat, _, _ = _ensure_clients()
    chain = GENERAL_PROMPT | chat | _parser
    return await _run_chain(chain, {"data": data}, timeout=timeout, brand=brand, chunk_id=chunk_id, operation=operation)


async def invoke_roadmap(payload: Dict[str, Any], *, timeout: int, brand: str, chunk_id: str, operation: str) -> str:
    chat, _, _ = _ensure_clients()
    chain = ROADMAP_PROMPT | chat | _parser
    variables = {
        "interests": payload.get("interests", "Not specified"),
        "skills": payload.get("skills", "Not specified"),
        "goal": payload.get("goal", "Not specified"),
    }
    return await _run_chain(chain, variables, timeout=timeout, brand=brand, chunk_id=chunk_id, operation=operation)


async def embed_query(text: str) -> list[float]:
    _, embeddings, _ = _ensure_clients()
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, embeddings.embed_query, text)
