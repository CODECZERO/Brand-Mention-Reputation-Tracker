# RapidQuest API Gateway (Service 2)

The API Gateway is the single entry point for the RapidQuest frontend. It exposes REST endpoints that surface live data aggregated by other services without modifying or reprocessing it.

## Features

- Health and Prometheus metrics endpoints
- Brand management backed by MongoDB (single active brand at a time)
- Read-only integrations with Redis for raw mentions, chunk analysis, and orchestrator summaries
- Request logging, CORS, Helmet, and rate limiting middleware
- Comprehensive latency instrumentation and graceful degradation when upstreams are unavailable

## Project Structure

```
src/
  app.ts              # Express app wiring and middleware
  server.ts           # Bootstrap logic with Mongo/Redis connections
  config/             # Environment and database configuration
  modules/
    brand/            # Brand Mongo model, repository, service, controller
  routes/             # Express routers for health, metrics, and brand APIs
  utils/              # Logger, Redis helpers, metrics registry, response helpers
  middleware/         # Error handling
```

## Environment Variables

Copy `.env.example` to `.env` and adjust as needed.

- `REDIS_URL`: Redis connection string
- `MONGO_URL`: MongoDB connection string
- `API_PORT`: Port to expose the HTTP server (default 4000)
- `LOG_LEVEL`: Pino log level

## Endpoints

| Method | Path                    | Description                                   |
| ------ | ----------------------- | --------------------------------------------- |
| GET    | `/health`               | Service health probe                          |
| GET    | `/metrics`              | Prometheus metrics                            |
| GET    | `/brand/current`        | Fetch active brand or waiting status          |
| POST   | `/brand/set`            | Set the active brand                          |
| GET    | `/brand/:brand/live`    | Last 24 hours of raw mentions                 |
| GET    | `/brand/:brand/chunks`  | Worker chunk analysis results                 |
| GET    | `/brand/:brand/summary` | Orchestrator summary                          |

All brand data endpoints return a `{ status: "waiting", message: string }` payload when data is not yet available. Redis failures surface as `{ status: "error", message: "Redis unavailable" }`.

## Local Development

```bash
npm install
npm run dev
```

The service will run on `http://localhost:4000` by default.

### Testing

```bash
npm test
```

Tests are written with Jest and Supertest. Redis and MongoDB interactions are mocked for deterministic behavior.

## Docker

Build the container and launch dependencies with Docker Compose:

```bash
docker compose up --build
```

The API is exposed on port `4000`. Redis and MongoDB are available on their default ports for local inspection.

## Integration Overview

- **Aggregator** writes raw mentions under `data:brand:<brand>:<day>:<hour>`
- **Workers** publish chunk analysis to `result:brand:<brand>:chunks`
- **Orchestrator** stores summaries at `summary:brand:<brand>`

The API Gateway only performs read operations against Redis (plus brand writes to MongoDB) and never triggers computation or external API calls.
