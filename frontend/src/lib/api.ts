import axios, { type AxiosResponse } from "axios";

import {
  type BrandListResponse,
  type CreateBrandRequest,
  type CreateBrandResponse,
  type BrandDetailResponse,
  type LiveMentionsResponse,
  type BrandSummaryResponse,
  type BrandSpikesResponse,
  type BrandAnalyticsResponse,
  type DeleteBrandResponse,
} from "@/types/api";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "http://localhost:3000",
  timeout: 8000,
});

function isWaitingResponse(value: unknown): value is { status: "waiting"; message: string } {
  return Boolean(value && typeof value === "object" && (value as { status?: string }).status === "waiting");
}

export async function getBrands(): Promise<BrandListResponse> {
  const response = await api.get<BrandDetailResponse | { status: string; message?: string }>("/api/brands/current");
  const data = response.data;
  if (data && typeof data === "object" && "status" in data) {
    return [];
  }
  return data ? [data as BrandDetailResponse] : [];
}

export function createBrand(payload: CreateBrandRequest): Promise<CreateBrandResponse> {
  return api
    .post<CreateBrandResponse>("/api/brands/set", { brand: payload.brandName })
    .then((res: AxiosResponse<CreateBrandResponse>) => res.data);
}

export async function getBrand(slug: string): Promise<BrandDetailResponse> {
  const brands = await getBrands();
  const match = brands.find((item) => item.slug === slug || item.name === slug);
  if (match) {
    return match;
  }
  return { name: slug, slug } as BrandDetailResponse;
}

export function deleteBrand(brand: string): Promise<DeleteBrandResponse> {
  console.warn("deleteBrand is not supported by the API; returning no-op for", brand);
  return Promise.resolve({ success: false });
}

export function getLiveMentions(brand: string): Promise<LiveMentionsResponse> {
  return api
    .get<LiveMentionsResponse | { status: string; message: string }>(`/api/brands/${brand}/live`)
    .then((res: AxiosResponse<LiveMentionsResponse | { status: string; message: string }>) => {
      const data = res.data;
      if (isWaitingResponse(data)) {
        return [];
      }
      return data as LiveMentionsResponse;
    });
}

export function getBrandSummary(brand: string): Promise<BrandSummaryResponse> {
  return api
    .get<BrandSummaryResponse | { status: string; message: string }>(`/api/brands/${brand}/summary`)
    .then((res: AxiosResponse<BrandSummaryResponse | { status: string; message: string }>) => {
      const data = res.data;
      if (isWaitingResponse(data)) {
        return {
          brand,
          generatedAt: new Date(0).toISOString(),
          totalChunks: 0,
          totalMentions: 0,
          sentiment: { positive: 0, neutral: 0, negative: 0, score: 0 },
          dominantTopics: [],
          clusters: [],
          spikeDetected: false,
          summary: data.message ?? "No summary yet",
          chunkSummaries: [],
        } satisfies BrandSummaryResponse;
      }
      return data as BrandSummaryResponse;
    });
}

export function getBrandSpikes(brand: string): Promise<BrandSpikesResponse> {
  return api
    .get<BrandSpikesResponse | { status: string; message: string }>(`/api/brands/${brand}/spikes`)
    .then((res: AxiosResponse<BrandSpikesResponse | { status: string; message: string }>) => {
      const data = res.data;
      if (isWaitingResponse(data)) {
        return { timeline: [], last24hCount: 0 } satisfies BrandSpikesResponse;
      }
      return data as BrandSpikesResponse;
    });
}

export function getBrandAnalytics(brand: string): Promise<BrandAnalyticsResponse> {
  return api
    .get<BrandAnalyticsResponse | { status: string; message: string }>(`/api/brands/${brand}/analytics`)
    .then((res: AxiosResponse<BrandAnalyticsResponse | { status: string; message: string }>) => {
      const data = res.data;
      if (isWaitingResponse(data)) {
        return { sentimentTrend: [], spikeTimeline: [], topics: [] } satisfies BrandAnalyticsResponse;
      }
      return data as BrandAnalyticsResponse;
    });
}
