# Service 3 Orchestrator

A production-ready orchestrator service for the RapidQuest multi-brand, real-time brand monitoring platform. The orchestrator coordinates Service 3 worker nodes, merges chunk-level analytics, and publishes aggregated insights back to Redis for consumption by the API (Service 2).

## Features

- Parallel brand processing with configurable concurrency limits
- Resilient Redis-based coordination (chunk queues, summaries, failed chunk capture)
- Graceful handling of empty/missing data
- Structured logging via `pino`
- Prometheus metrics (processing, IO, cluster aggregation)
- Fastify-based health (`/health`) and metrics (`/metrics`) endpoints
- Configurable merge similarity thresholds and backoff strategies
- Production-grade Dockerfile and sample `docker-compose` for local testing

## Project Structure

```
/orchestrator
  ├── Dockerfile
  ├── README.md
  ├── docker-compose.orchestrator.yml
  ├── package.json
  ├── tsconfig.json
  ├── tsconfig.build.json
  ├── .env.example
  ├── src/
  │   ├── index.ts                 # service bootstrap
  │   └── orchestrator/
  │       ├── app.ts               # orchestrator application (loop + HTTP)
  │       ├── aggregator.ts        # merge chunk results
  │       ├── config.ts            # env parsing & defaults
  │       ├── health.ts            # health snapshot helpers
  │       ├── logger.ts            # structured logging
  │       ├── metrics.ts           # Prometheus registry/metrics
  │       ├── redis_client.ts      # Redis connection wrapper
  │       ├── result_collector.ts  # BLPOP chunk results from Redis
  │       ├── summary_generator.ts # brand-level summary synthesis
  │       ├── types.ts             # shared interfaces
  │       └── utils.ts             # helpers (keys, timing, backoff)
  └── tests/
      ├── test_aggregator.ts
      └── test_result_collector.ts
```

## Configuration

Copy `.env.example` to `.env` and adjust as needed:

```
REDIS_URL=redis://localhost:6379
ORCHESTRATOR_ID=orchestrator-1
CONCURRENCY_LIMIT=5
HTTP_PORT=9000
PROMETHEUS_PORT=9001
MERGE_SIMILARITY_THRESHOLD=0.75
MAX_RETRIES=3
RETRY_BACKOFF_BASE=2
BRAND_REFRESH_INTERVAL_SEC=30
CHUNK_FETCH_TIMEOUT_SEC=30
LOG_LEVEL=info
```

> `ORCHESTRATOR_ID` is optional – if omitted, a random ID is generated at runtime.

## Local Development

```bash
# Install dependencies
npm install

# Run in watch mode
override NODE_ENV=development npm run dev

# Lint & test
npm run lint
npm test

# Build production bundle
npm run build
```

### Using Docker

Build and run the orchestrator container together with Redis:

```bash
docker-compose -f docker-compose.orchestrator.yml up --build
```

The orchestrator exposes:

- Health: `http://localhost:9000/health`
- Metrics: `http://localhost:9001/metrics`

### Simulating Input

Use `redis-cli` (or any Redis client) to push fake results and review the aggregated summary:

```bash
# Sample chunk result payload
redis-cli RPUSH result:brand:nike:chunks '{"chunkId":"nike-1","brand":"nike","processedAt":"2025-01-01T00:00:00Z","sentiment":{"positive":5,"neutral":2,"negative":1,"score":4},"topics":["launch"],"clusters":[{"id":"launch-positive","label":"Launch Buzz","mentions":["m1","m2"],"spike":true}],"meta":{"mentionCount":3}}'

# Read merged summary after orchestrator processes the chunk
redis-cli GET summary:brand:nike
```

## Scaling Guidance

- **Horizontal scaling:** run multiple orchestrator containers; the brand-level processing lock ensures only one orchestrator handles a brand at a time.
- **Worker discovery:** orchestrator processes any brand registered under the Redis `brands:list` set/list. Adjust `CONCURRENCY_LIMIT` based on worker throughput.
- **Observability:** connect Prometheus to `/metrics` and configure scrape configs. Logging is JSON by default in production.

## Testing

Vitest is used for unit/integration tests. Initial tests cover:

- `aggregateBrandChunks` (cluster merge & sentiment aggregation)
- `result_collector` (payload parsing & invalid handling – test stub provided)

Add additional tests for custom business logic as rollout continues.

## Deployment

1. Build container (`docker build -t service3-orchestrator .`).
2. Provide runtime environment variables (see `.env.example`).
3. Ensure network access to Redis and any upstream services.
4. Monitor via metrics and logs to confirm healthy chunk ingestion and summary publishing.
