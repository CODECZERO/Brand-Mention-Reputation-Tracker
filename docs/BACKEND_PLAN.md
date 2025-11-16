# Backend Build Plan

## Overview
- Multi-service architecture inspired by Testcore patterns.
- Shared TypeScript utilities already created for logging, Redis, chunking, and configuration.
- Services pending implementation use the shared package.

## Shared Package (Completed)
- ✅ Environment loader `@shared/src/config/env.ts`
- ✅ Logger with waiting helper `@shared/src/logger/index.ts`
- ✅ Redis client factory `@shared/src/redis/index.ts`
- ✅ Domain types and constants `@shared/src/types`, `@shared/src/constants`
- ✅ Async handler wrapper and error utilities `@shared/src/utils`

## Service Setup Status
1. **Aggregator** (`/aggregator`) – scaffolding in progress
   - TODO: Implement API clients (X, Reddit, News) following Testcore service/provider pattern.
   - TODO: Deduplication logic and Redis writes with graceful empty handling.
  - TODO: Express health endpoint, cron/polling task runner, Dockerfile.

2. **Orchestrator** (`/orchestrator`) – scaffolding in progress
   - TODO: Redis chunk reading, queueing, retry orchestrations.
   - TODO: Process collection loop, merging logic, storage of final analysis.
   - TODO: Express status endpoints, Dockerfile.

3. **API** (`/api`) – not started
   - TODO: Controllers for brands, live data, summary with waiting responses.
   - TODO: Redis interactions for brand set management and latest analysis retrieval.
   - TODO: Express configuration, Dockerfile.

4. **Worker** (`/worker`) – not started (Python)
   - TODO: Create Python package structure with Redis BLPOP loop.
   - TODO: Implement clustering/spike detection stubs, LLM summary placeholder.
   - TODO: Dockerfile and configuration alignment with env vars.

5. **Nginx** (`/nginx`) – not started
   - TODO: Add `nginx.conf` for frontend→API routing and optional upstreams.
   - TODO: Dockerfile.

6. **Docker & Deployment** – not started
   - TODO: Docker Compose (optional) for local testing.
   - TODO: Document env variables and multi-machine deployment notes.
