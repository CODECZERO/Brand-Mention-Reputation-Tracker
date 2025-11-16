process.env.REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
process.env.MONGO_URL = process.env.MONGO_URL ?? "mongodb://localhost:27017/rapidquest";
process.env.API_PORT = process.env.API_PORT ?? "4000";
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? "silent";
process.env.API_GATEWAY_RATE_LIMIT = process.env.API_GATEWAY_RATE_LIMIT ?? "120";
process.env.ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS ?? "*";
process.env.ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL ?? "http://localhost:9000";
process.env.WORKER_STATUS_URL = process.env.WORKER_STATUS_URL ?? "http://localhost:8000/status";
process.env.AGGREGATOR_URL = process.env.AGGREGATOR_URL ?? "http://localhost:4001";

