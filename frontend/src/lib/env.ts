type UrlEnvKey = keyof typeof optionalUrlKeys;

const optionalUrlKeys = {
  orchestratorUrl: "NEXT_PUBLIC_ORCHESTRATOR_URL" as const,
  aggregatorUrl: "NEXT_PUBLIC_AGGREGATOR_URL" as const,
  workerUrl: "NEXT_PUBLIC_WORKER_URL" as const,
  brandEndpoint: "NEXT_PUBLIC_BRAND_ENDPOINT" as const,
};

export interface RuntimeEnv {
  apiUrl: string;
  orchestratorUrl?: string;
  aggregatorUrl?: string;
  workerUrl?: string;
  brandEndpoint?: string;
}

function readEnvValue(key: string): string | undefined {
  return (import.meta.env[key as keyof ImportMetaEnv] as string | undefined) ??
    (import.meta.env[`VITE_${key.replace(/^NEXT_PUBLIC_/, "")}` as keyof ImportMetaEnv] as string | undefined);
}

function ensureUrl(value: string | undefined, key: string, { required }: { required: boolean }): string | undefined {
  if (!value) {
    if (required) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
    return undefined;
  }

  try {
    // eslint-disable-next-line no-new
    new URL(value);
    return value;
  } catch {
    throw new Error(`Invalid URL provided for ${key}: ${value}`);
  }
}

const apiUrl = ensureUrl(readEnvValue("NEXT_PUBLIC_API_URL"), "NEXT_PUBLIC_API_URL", { required: true })!;

const optionalUrls: Partial<Record<UrlEnvKey, string>> = {};
for (const [prop, key] of Object.entries(optionalUrlKeys) as [UrlEnvKey, string][]) {
  const value = ensureUrl(readEnvValue(key), key, { required: false });
  if (value) {
    optionalUrls[prop] = value;
  }
}

export const runtimeEnv: RuntimeEnv = {
  apiUrl,
  ...optionalUrls,
};
