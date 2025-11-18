#!/usr/bin/env bash
set -euo pipefail

export NODE_ENV="${NODE_ENV:-production}"
export LISTEN_PORT="${LISTEN_PORT:-10000}"
export API_PORT="${API_PORT:-4000}"
export AGGREGATOR_PORT="${AGGREGATOR_PORT:-3001}"
export ORCHESTRATOR_PORT="${ORCHESTRATOR_PORT:-3003}"
export WORKER_PORT="${WORKER_PORT:-3004}"
export PROMETHEUS_PORT="${PROMETHEUS_PORT:-9103}"
export WORKER_STATUS_PORT="${WORKER_STATUS_PORT:-3005}"

log() {
  echo "[$(date --iso-8601=seconds)] $*"
}

log "Starting services inside Render container"

log "Migrating API gateway dependencies"
cd /app/api-gateway
node dist/server.js &
API_PID=$!
cd /app

log "Starting aggregator service"
cd /app/aggregator
node dist/server.js &
AGGREGATOR_PID=$!
cd /app

log "Starting orchestrator"
cd /app/orchestrator
node dist/index.js &
ORCHESTRATOR_PID=$!
cd /app

log "Starting Rust worker"
/usr/local/bin/worker-rs &
WORKER_PID=$!

log "Waiting for services to warm up"
sleep 5

log "Rendering Nginx configuration"
export DOLLAR='$'
envsubst < /etc/nginx/templates/render.conf.template > /etc/nginx/conf.d/default.conf

log "Starting Nginx on port ${LISTEN_PORT}"
nginx -g "daemon off;" &
NGINX_PID=$!

trap 'log "Stopping services"; kill $API_PID $AGGREGATOR_PID $ORCHESTRATOR_PID $WORKER_PID $NGINX_PID || true; wait' TERM INT

wait
