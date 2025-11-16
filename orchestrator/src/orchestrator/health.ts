export interface HealthSnapshot {
  processedBrandsTotal: number;
  lastProcessedAt: Map<string, number>;
  activeBrands: Set<string>;
  startTime: number;
  successfulBrands: Set<string>;
  failedBrands: Set<string>;
}

export function createHealthSnapshot(): HealthSnapshot {
  return {
    processedBrandsTotal: 0,
    lastProcessedAt: new Map(),
    activeBrands: new Set(),
    startTime: Date.now(),
    successfulBrands: new Set(),
    failedBrands: new Set(),
  };
}

export function updateHealthOnStart(snapshot: HealthSnapshot, brand: string): void {
  snapshot.activeBrands.add(brand);
}

export function updateHealthOnFinish(snapshot: HealthSnapshot, brand: string, success: boolean): void {
  snapshot.activeBrands.delete(brand);
  snapshot.lastProcessedAt.set(brand, Date.now());
  snapshot.processedBrandsTotal += 1;
  if (success) {
    snapshot.successfulBrands.add(brand);
    snapshot.failedBrands.delete(brand);
  } else {
    snapshot.failedBrands.add(brand);
  }
}

export function buildHealthPayload(snapshot: HealthSnapshot, orchestratorId: string) {
  const uptimeSeconds = Math.round((Date.now() - snapshot.startTime) / 1000);
  const lastProcessedAt = Array.from(snapshot.lastProcessedAt.values());
  const latestProcessed = lastProcessedAt.length > 0 ? new Date(Math.max(...lastProcessedAt)).toISOString() : null;

  return {
    status: "ok" as const,
    orchestratorId,
    uptimeSeconds,
    processedBrands: snapshot.processedBrandsTotal,
    activeBrands: Array.from(snapshot.activeBrands),
    lastProcessedAt: latestProcessed,
    successfulBrands: Array.from(snapshot.successfulBrands),
    failedBrands: Array.from(snapshot.failedBrands),
  };
}
