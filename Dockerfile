# Multi-service container for Render deployment
# Builds frontend + Node microservices and runs them behind Nginx

# ------------------------------
# Node build stage
# ------------------------------
FROM node:20-bullseye AS node-builder

ENV NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false \
    npm_config_loglevel=warn \
    npm_config_include=dev \
    NPM_CONFIG_INCLUDE=dev

WORKDIR /workspace

COPY . .

RUN npm config delete include || true

RUN cd shared \
    && npm ci \
    && npm run build \
    && npm prune --omit=dev

RUN cd aggregator \
    && npm ci \
    && npm run build \
    && npm prune --omit=dev

RUN cd api-gateway \
    && npm ci \
    && npm run build \
    && npm prune --omit=dev

RUN cd orchestrator \
    && npm ci \
    && npm run build \
    && npm prune --omit=dev

RUN cd frontend \
    && npm ci \
    && npm run build

# ------------------------------
# Python build stage for worker
# ------------------------------
FROM python:3.11-slim AS python-builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /workspace

COPY worker/requirements.txt ./

RUN python -m venv /opt/venv \
    && /opt/venv/bin/pip install --upgrade pip \
    && /opt/venv/bin/pip install --no-cache-dir -r requirements.txt

# ------------------------------
# Final runtime stage
# ------------------------------
FROM python:3.11-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:${PATH}"

# Install system deps, Node.js 20, and Nginx
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        bash \
        curl \
        gnupg \
        ca-certificates \
        build-essential \
        git \
        nginx \
        tini \
        libopenblas0 \
        libomp5 \
        libgl1 \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Copy Python virtualenv from builder
COPY --from=python-builder /opt/venv /opt/venv

WORKDIR /app

# Copy service bundles from Node builder
COPY --from=node-builder /workspace/shared/dist ./shared/dist

COPY --from=node-builder /workspace/api-gateway/dist ./api-gateway/dist
COPY --from=node-builder /workspace/api-gateway/node_modules ./api-gateway/node_modules
COPY --from=node-builder /workspace/api-gateway/package.json ./api-gateway/package.json

COPY --from=node-builder /workspace/aggregator/dist ./aggregator/dist
COPY --from=node-builder /workspace/aggregator/node_modules ./aggregator/node_modules
COPY --from=node-builder /workspace/aggregator/package.json ./aggregator/package.json

COPY --from=node-builder /workspace/orchestrator/dist ./orchestrator/dist
COPY --from=node-builder /workspace/orchestrator/node_modules ./orchestrator/node_modules
COPY --from=node-builder /workspace/orchestrator/package.json ./orchestrator/package.json

COPY worker/src ./worker/src

# Static frontend assets served by Nginx
COPY --from=node-builder /workspace/frontend/dist /usr/share/nginx/html

# Nginx template & startup script
COPY deployment/nginx/render.conf.template /etc/nginx/templates/render.conf.template
COPY deployment/scripts/start-render.sh /usr/local/bin/start-render.sh

RUN chmod +x /usr/local/bin/start-render.sh \
    && chmod -R 755 /usr/share/nginx/html \
    && mkdir -p /run/nginx

ENV NODE_ENV=production \
    LISTEN_PORT=10000 \
    API_PORT=4000 \
    AGGREGATOR_PORT=3001 \
    ORCHESTRATOR_PORT=3003 \
    WORKER_PORT=3004 \
    PROMETHEUS_PORT=9103 \
    WORKER_STATUS_PORT=3005

EXPOSE 10000

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/start-render.sh"]
