export const REDIS_KEYS = {
  brandData: (brand: string, dateKey: string, hour: string) => `data:${brand}:${dateKey}:${hour}`,
  brandQueue: (brand: string) => `queue:${brand}`,
  brandProcessedQueue: (brand: string) => `queue:${brand}:processed`,
  brandResults: (brand: string) => `latest_analysis:${brand}`,
  brandMentions: (brand: string) => `data:brand:${brand}:mentions`,
  brandTaskNamespace: (brand: string) => `task:${brand}`,
  brandMetadata: (brand: string) => `brand:${brand}:meta`,
};

export const REDIS_STREAMS = {
  orchestratorResults: (brand: string) => `stream:orchestrator:results:${brand}`,
};

export const REDIS_SETS = {
  brands: () => `brands:set`,
};
