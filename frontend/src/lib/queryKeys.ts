export const queryKeys = {
  brands: () => ["brands"] as const,
  brand: (brandId: string) => ["brand", brandId] as const,
  brandSummary: (brandId: string) => ["brand", brandId, "summary"] as const,
  brandSpikes: (brandId: string) => ["brand", brandId, "spikes"] as const,
  liveMentions: (brandId: string) => ["brand", brandId, "live"] as const,
  analytics: (brandId: string) => ["brand", brandId, "analytics"] as const,
};
