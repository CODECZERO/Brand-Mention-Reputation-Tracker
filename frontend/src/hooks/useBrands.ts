import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createBrand,
  deleteBrand,
  getBrand,
  getBrandAnalytics,
  getBrandSpikes,
  getBrandSummary,
  getBrands,
  getLiveMentions,
} from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import {
  type BrandDetailResponse,
  type BrandListResponse,
  type BrandAnalyticsResponse,
  type DeleteBrandResponse,
  type BrandSpikesResponse,
  type BrandSummaryResponse,
  type CreateBrandRequest,
  type CreateBrandResponse,
  type LiveMentionsResponse,
} from "@/types/api";

export function useBrands() {
  return useQuery<BrandListResponse>({
    queryKey: queryKeys.brands(),
    queryFn: getBrands,
  });
}

export function useBrand(brandId: string) {
  return useQuery<BrandDetailResponse>({
    queryKey: queryKeys.brand(brandId),
    queryFn: () => getBrand(brandId),
    enabled: Boolean(brandId),
  });
}

export function useCreateBrand() {
  const queryClient = useQueryClient();
  return useMutation<CreateBrandResponse, Error, CreateBrandRequest>({
    mutationFn: (payload) => createBrand(payload),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.brands() });
      if (response?.slug) {
        queryClient.invalidateQueries({ queryKey: queryKeys.brand(response.slug) });
      }
    },
  });
}

export function useDeleteBrand() {
  const queryClient = useQueryClient();
  return useMutation<DeleteBrandResponse, Error, string>({
    mutationFn: (brandId) => deleteBrand(brandId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.brands() });
    },
  });
}

export function useBrandSummary(brandId: string) {
  return useQuery<BrandSummaryResponse>({
    queryKey: queryKeys.brandSummary(brandId),
    queryFn: () => getBrandSummary(brandId),
    enabled: Boolean(brandId),
    refetchInterval: 60_000,
  });
}

export function useBrandSpikes(brandId: string) {
  return useQuery<BrandSpikesResponse>({
    queryKey: queryKeys.brandSpikes(brandId),
    queryFn: () => getBrandSpikes(brandId),
    enabled: Boolean(brandId),
    refetchInterval: 60_000,
  });
}

export function useLiveMentions(brandId: string) {
  return useQuery<LiveMentionsResponse>({
    queryKey: queryKeys.liveMentions(brandId),
    queryFn: () => getLiveMentions(brandId),
    enabled: Boolean(brandId),
    refetchInterval: 10_000,
  });
}

export function useBrandAnalytics(brandId: string) {
  return useQuery<BrandAnalyticsResponse>({
    queryKey: queryKeys.analytics(brandId),
    queryFn: () => getBrandAnalytics(brandId),
    enabled: Boolean(brandId),
    refetchInterval: 60_000,
  });
}
