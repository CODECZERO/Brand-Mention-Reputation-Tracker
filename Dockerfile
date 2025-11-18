# Multi-service container for Render deployment
# Builds frontend + Node microservices and runs them behind Nginx

# ------------------------------
# Node build stage
# ------------------------------
FROM node:20-bullseye AS node-builder

ENV NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false \
    npm_config_loglevel=warn

WORKDIR /workspace

COPY . .

RUN npm config delete include --location=global || true \
    && npm config delete include --location=user || true \
    && npm config delete include --location=project || true

RUN cd shared \
    && unset npm_config_include NPM_CONFIG_INCLUDE \
    && npm i  \
    && npm run build

RUN cd aggregator \
    && unset npm_config_include NPM_CONFIG_INCLUDE \
    && npm i \
    && npm run build

RUN cd api-gateway \
    && unset npm_config_include NPM_CONFIG_INCLUDE \
    && npm i \
    && npm run build

RUN cd orchestrator \
    && unset npm_config_include NPM_CONFIG_INCLUDE \
    && npm i  \
    && npm run build

RUN cd frontend \
    && unset npm_config_include NPM_CONFIG_INCLUDE \
    && npm i \
    && npm run build

# ------------------------------
# Rust build stage for worker
# ------------------------------
FROM rust:1.83-bullseye AS rust-builder

WORKDIR /workspace

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        pkg-config \
    && rm -rf /var/lib/apt/lists/*

COPY worker-rs ./worker-rs

WORKDIR /workspace/worker-rs

RUN cargo build --release

# ------------------------------
# Final runtime stage
# ------------------------------
FROM node:20-bullseye AS runtime

ENV NODE_ENV=production \
    LISTEN_PORT=10000 \
    API_PORT=4000 \
    AGGREGATOR_PORT=3001 \
    ORCHESTRATOR_PORT=3003 \
    WORKER_PORT=3004 \
    PROMETHEUS_PORT=9103 \
    WORKER_STATUS_PORT=3005

# Install system deps and Nginx
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        bash \
        ca-certificates \
        git \
        nginx \
        gettext-base \
        tini \
        libopenblas0 \
        libomp5 \
        libgl1 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

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

COPY --from=rust-builder /workspace/worker-rs/target/release/worker-rs /usr/local/bin/worker-rs

# Static frontend assets served by Nginx
COPY --from=node-builder /workspace/frontend/dist /usr/share/nginx/html

# Nginx template & startup script
COPY deployment/nginx/render.conf.template /etc/nginx/templates/render.conf.template
COPY deployment/scripts/start-render.sh /usr/local/bin/start-render.sh

RUN chmod +x /usr/local/bin/start-render.sh \
    && chmod -R 755 /usr/share/nginx/html \
    && mkdir -p /run/nginx

EXPOSE 10000

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/start-render.sh"]
