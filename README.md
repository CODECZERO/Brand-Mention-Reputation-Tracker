# Brand-Mention-Reputation-Tracker


A full-stack brand intelligence platform that ingests live mentions across the web, enriches them with AI, and surfaces insights through a React dashboard. The system is composed of multiple services (API Gateway, Aggregator, Orchestrator, Worker, Shared utilities) tied together via Redis queues and MongoDB, with a Vite + Tailwind frontend. A production deployment can be packaged into a single Docker container that serves the frontend and proxies backend APIs through Nginx.

## Repository Layout

```
rapidQuest/
├── api-gateway/          # Express API serving brand data to the frontend
├── aggregator/           # Fetches & normalises mentions from external providers
├── orchestrator/         # Coordinates chunk processing & summarisation tasks
├── worker/               # Python worker that processes chunks with LLMs
├── frontend/             # React dashboard (Vite, Tailwind, shadcn/ui)
├── shared/               # Shared TypeScript utilities (env, redis helpers, types)
├── deployment/
│   ├── nginx/render.conf.template  # Nginx template for single-container deployment
│   └── scripts/start-render.sh     # Entrypoint launching services + Nginx
├── Dockerfile            # Multi-stage build for combined deployment
└── README.md             # This document
```

## Core Services

| Service       | Runtime        | Purpose |
|---------------|----------------|---------|
| **API Gateway** (`api-gateway`) | Node.js (Express) | Public API consumed by the frontend. Handles brand CRUD, live mentions, spikes, summaries. Connects to MongoDB & Redis. |
| **Aggregator** (`aggregator`) | Node.js (Express) | Polls external sources (Reddit, News, X, RSS) for brand mentions, normalises them, and writes to Redis. |
| **Orchestrator** (`orchestrator`) | Node.js (Fastify) | Coordinates chunked processing, monitors workers, aggregates results, exposes health/metrics endpoints. |
| **Worker** (`worker-rs`) | Rust (Tokio + Axum) | Consumes chunk jobs from Redis, runs embedding & LLM pipelines, stores enriched results back to Redis. |
| **Frontend** (`frontend`) | React + Vite | Dashboard showing live mentions, analytics, spike alerts, topic clusters. |
| **Shared** (`shared`) | TypeScript library | Common config, types, Redis helpers shared between Node services. |

## Architecture Overview (Text)

```
     ┌──────┐    ┌───────┐    ┌────────┐
     │  X   │    │ Reddit│    │ News API│
     └──┬───┘    └──┬────┘    └───┬────┘
        │           │            │
        └──────┬────┴────┬───────┘
               │         │ fetch data
               ▼         │
           ┌───────────────┐
           │  Aggregator    │
           │ (fetch & chunk │
           │    batches)    │
           └──────┬─────────┘
                  │ store chunk jobs
                  ▼
           ┌───────────────┐
           │     Redis     │
           │ (queue + KV)  │
           └─┬────┬────┬───┘
      chunk 1│    │    │chunk 3
             │    │
             ▼    ▼
        ┌────────────┐    ┌────────────┐    ┌────────────┐
        │  Worker A   │    │  Worker B   │    │  Worker C   │
        │ (process)   │    │ (process)   │    │ (process)   │
        └────┬────────┘    └────┬────────┘    └────┬────────┘
             │ chunk results     │ chunk results     │ chunk results
             └────┬──────────────┴──────────────┬────┘
                  │ push back to Redis (results)
                  ▼
           ┌───────────────┐
           │     Redis     │
           │ (worker data) │
           └──────┬────────┘
                  │ read combined data
                  ▼
           ┌───────────────┐
           │ Orchestrator  │
           │  (merge + gen │
           │   full data)  │
           └──────┬────────┘
                  │ final payloads
                  ▼
           ┌───────────────┐
           │  API Gateway  │
           │  (public API) │
           └──────┬────────┘
                  │ serve UI
                  ▼
           ┌───────────────┐
           │   Frontend    │
           │  Dashboard    │
           └───────────────┘
```

## Technology Stack

- **Backend:** Node.js 20, Express, Fastify, Redis, MongoDB, TypeScript
- **Worker:** Rust (Tokio, Axum, reqwest, Redis, serde)
- **Frontend:** React 18, Vite, Tailwind CSS, shadcn/ui, React Query
- **Infrastructure:** Redis queues/keys, MongoDB for persistent data, Docker + Nginx for deployment

## Environment Configuration

Each service has its own `.env` or environment schema. Key variables:

| Service | Important Variables |
|---------|--------------------|
| `api-gateway` | `PORT`, `REDIS_URL`, `BRAND_DB_URL`, `ORCHESTRATOR_URL`, `AGGREGATOR_URL`, `WORKER_STATUS_URL`, `ALLOWED_ORIGINS` |
| `aggregator` | `AGGREGATOR_PORT`, `REDIS_URL`, `MONGO_URL`, provider credentials (`REDDIT_CLIENT_ID`, etc.), rate/TTL settings |
| `orchestrator` | `REDIS_URL`, `HTTP_PORT`, `PROMETHEUS_PORT`, `WORKER_STATUS_PORT`, rate/interval limits |
| `worker` | `REDIS_URL`, `HTTP_PORT`, `PROMETHEUS_PORT`, `CHUNK_BATCH_SIZE`, provider API keys (OpenAI/Gemini), retry/timeouts |
| `frontend` | `VITE_API_URL` (defaults to `/api`), standard Vite env variables |

> **Tip:** Never commit real API keys. Use local `.env` files for development and configure secrets in Render/CI.

## Local Development

### Prerequisites

- Node.js 20+
- Python 3.11+
- Redis server
- MongoDB server
- pnpm or npm (project uses npm lock files)

### Installing Dependencies

```bash
# Install shared package first (build outputs consumed by other services)
cd shared
npm install
npm run build

# API Gateway
cd ../api-gateway
npm install

# Aggregator
cd ../aggregator
npm install

# Orchestrator
cd ../orchestrator
npm install

# Frontend
cd ../frontend
npm install

# Python worker
cd ../worker
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### Running Services Individually

```bash
# API Gateway (http://localhost:3002 by default)
cd api-gateway
npm run dev

# Aggregator (http://localhost:3001)
cd aggregator
npm run dev

# Orchestrator (http://localhost:3003)
cd orchestrator
npm run dev

# Worker (serves health/metrics on configured ports)
cd worker
source .venv/bin/activate
python -m worker.app

# Frontend (http://localhost:5173)
cd frontend
npm run dev
```

Ensure Redis & MongoDB are running locally (or update env URLs). The worker depends on the Redis queues populated by the aggregator and orchestrator.

### Testing

- `api-gateway`: `npm test`
- Other services currently rely on manual/integration testing; add tests as you extend the platform.

## Single-Container Deployment (Render)

The repository ships with a Dockerfile and helper assets to run the entire stack inside one container behind Nginx.

### Build & Run Locally

```bash
# Build the image
DOCKER_BUILDKIT=1 docker build -t rapidquest:latest .

# Run with necessary env vars (example)
docker run -p 10000:10000 \
  -e LISTEN_PORT=10000 \
  -e API_PORT=4000 \
  -e AGGREGATOR_PORT=3001 \
  -e ORCHESTRATOR_PORT=3003 \
  -e WORKER_PORT=3004 \
  -e PROMETHEUS_PORT=9103 \
  -e WORKER_STATUS_PORT=3005 \
  -e REDIS_URL="redis://..." \
  -e BRAND_DB_URL="mongodb://..." \
  rapidquest:latest
```

Inside the container:

- `deployment/scripts/start-render.sh` launches API Gateway, Aggregator, Orchestrator, Worker, then renders the Nginx template and starts Nginx in the foreground.
- `deployment/nginx/render.conf.template` proxies `/api/*` to the API Gateway on `127.0.0.1:${API_PORT}` and serves the built frontend from `/usr/share/nginx/html`.
- Additional paths (`/orchestrator/`, `/worker/`) can be exposed through the same proxy.

On Render, point the service at the container image, expose `LISTEN_PORT`, and configure all required environment variables/secrets. The public Render URL serves the React build, and REST calls (`/api/...`) are transparently proxied without needing separate DNS records.

## Redis Key Conventions

Shared constants (see `shared/src/constants/redisKeys.ts`):

- `data:brand:<slug>:mentions` – latest live mentions per brand
- `queue:brand:<slug>:chunks` – chunk jobs for worker processing
- `latest_analysis:<slug>` – orchestrator summary results
- `brand:<slug>:meta` – brand metadata for dashboards

## Troubleshooting

- **No live mentions in UI:** Ensure `api-gateway` can reach Redis and is fetching the consolidated `data:brand:<slug>:mentions` key. The aggregator must be running and writing mentions.
- **Worker idle:** Confirm aggregator is enqueuing chunks (`queue:brand:<slug>:chunks`) and that environment keys (`EMBEDDINGS_PROVIDER`, API keys) are set.
- **Render deployment issues:** Check container logs to ensure all services started. Verify Nginx rendered configuration (`/etc/nginx/conf.d/default.conf`).

## Contributing

1. Fork and branch: `git checkout -b feature/<name>`
2. Make focused changes; run service-specific builds/tests
3. Keep code style consistent (TypeScript strict mode, lint rules in each package)
4. Submit PR with description of service impact

## License

This project is proprietary to the RapidQuest team. All rights reserved.
# Brand-Mention-Reputation-Tracker
