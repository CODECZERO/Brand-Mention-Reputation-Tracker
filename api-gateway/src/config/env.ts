import { config } from "dotenv";
import { z } from "zod";

config();

const envSource: Record<string, string | undefined> = { ...process.env };

if (!envSource.PORT && envSource.API_PORT) {
  envSource.PORT = envSource.API_PORT;
}

if (!envSource.BRAND_DB_URL && envSource.MONGO_URL) {
  envSource.BRAND_DB_URL = envSource.MONGO_URL;
}

const EnvSchema = z.object({
  PORT: z.coerce.number().default(3002),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  BRAND_DB_URL: z.string().default("mongodb://localhost:27017/rapidquest"),
  JWT_SECRET: z.string().optional(),
  API_GATEWAY_RATE_LIMIT: z.coerce.number().default(120),
  ORCHESTRATOR_URL: z.string().default("http://localhost:3003"),
  WORKER_STATUS_URL: z.string().default("http://localhost:3004/status"),
  AGGREGATOR_URL: z.string().default("http://localhost:3001"),
  ALLOWED_ORIGINS: z.string().default("*"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
});

const parsed = EnvSchema.safeParse(envSource);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
    .join(", ");
  console.warn(`[env] Invalid values detected. Falling back to defaults where possible: ${issues}`);
}

const values = parsed.success ? parsed.data : EnvSchema.parse({});

const warnIfMissing = (key: keyof typeof values, message: string, aliases: string[] = []) => {
  const hasValue = [key as string, ...aliases].some((candidate) => {
    const raw = envSource[candidate];
    return raw !== undefined && raw !== "";
  });

  if (!hasValue) {
    console.warn(`[env] ${message}`);
  }
};

warnIfMissing("REDIS_URL", "REDIS_URL missing. Defaulting to redis://localhost:6379");
warnIfMissing(
  "BRAND_DB_URL",
  "BRAND_DB_URL (or legacy MONGO_URL) missing. Defaulting to mongodb://localhost:27017/rapidquest",
  ["MONGO_URL"],
);
warnIfMissing("PORT", "PORT (or legacy API_PORT) missing. Defaulting to 3002", ["API_PORT"]);
warnIfMissing(
  "API_GATEWAY_RATE_LIMIT",
  "API_GATEWAY_RATE_LIMIT missing. Defaulting to 120 req/min",
);
warnIfMissing("ALLOWED_ORIGINS", "ALLOWED_ORIGINS missing. Defaulting to '*' ");
warnIfMissing("ORCHESTRATOR_URL", "ORCHESTRATOR_URL missing. Defaulting to http://localhost:3003");
warnIfMissing("WORKER_STATUS_URL", "WORKER_STATUS_URL missing. Defaulting to http://localhost:3004/status");
warnIfMissing("AGGREGATOR_URL", "AGGREGATOR_URL missing. Defaulting to http://localhost:3001");

export const env = {
  port: values.PORT,
  redisUrl: values.REDIS_URL,
  brandDbUrl: values.BRAND_DB_URL,
  jwtSecret: values.JWT_SECRET,
  rateLimit: values.API_GATEWAY_RATE_LIMIT,
  orchestratorUrl: values.ORCHESTRATOR_URL,
  workerStatusUrl: values.WORKER_STATUS_URL,
  aggregatorUrl: values.AGGREGATOR_URL,
  allowedOrigins: values.ALLOWED_ORIGINS,
  logLevel: values.LOG_LEVEL,
};
