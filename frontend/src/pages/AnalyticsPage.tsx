import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";

import { SentimentBreakdownCard } from "@/components/analytics/SentimentBreakdownCard";
import { TopicWordCloud } from "@/components/charts/TopicWordCloud";
import { SentimentTrendChart } from "@/components/charts/SentimentTrendChart";
import { SpikeTimelineChart } from "@/components/charts/SpikeTimelineChart";
import { LoadingState } from "@/components/shared/LoadingState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useBrandAnalytics, useBrandSpikes, useBrandSummary } from "@/hooks/useBrands";

export default function AnalyticsPage() {
  const { brandId = "" } = useParams();

  const {
    data: analytics,
    isLoading: analyticsLoading,
    isError: analyticsError,
    error: analyticsErrorObj,
  } = useBrandAnalytics(brandId);
  const { data: summary } = useBrandSummary(brandId);
  const { data: spikes } = useBrandSpikes(brandId);

  const sentimentTrend = analytics?.sentimentTrend ?? [];
  const latestSentiment = useMemo(() => sentimentTrend.at(-1), [sentimentTrend]);
  const spikeTimeline = spikes?.timeline ?? [];
  const topics = analytics?.topics ?? summary?.dominantTopics?.map((term) => ({ term, weight: 0.12 })) ?? [];
  const summaryParagraphs = useMemo(() => {
    if (!summary?.summary) return [] as string[];
    return summary.summary
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);
  }, [summary?.summary]);
  const clusterHighlights = summary?.clusters ?? [];
  const [isSummaryExpanded, setSummaryExpanded] = useState(false);
  const maxSummaryParagraphs = isSummaryExpanded ? summaryParagraphs.length : 2;
  const maxClusterItems = isSummaryExpanded ? clusterHighlights.length : 3;
  const maxChunkHighlights = isSummaryExpanded ? summary?.chunkSummaries?.length ?? 0 : 3;

  if (analyticsLoading) {
    return <LoadingState message="Loading analytics..." />;
  }

  if (analyticsError) {
    return (
      <Card className="border-destructive/50">
        <CardContent className="p-4 text-sm text-destructive">
          {analyticsErrorObj?.message ?? "Unable to load analytics."}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Analytics</h2>
        <p className="text-sm text-muted-foreground">
          Combining <code>GET /api/brands/:id/summary</code>, <code>/api/brands/:id/spikes</code>, and
          <code>/api/brands/:id/analytics</code> for deeper insight.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <SentimentBreakdownCard
          positive={latestSentiment?.positive ?? summary?.sentiment.positive ?? 0}
          neutral={latestSentiment?.neutral ?? summary?.sentiment.neutral ?? 0}
          negative={latestSentiment?.negative ?? summary?.sentiment.negative ?? 0}
        />
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Spike stats</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              <strong>Current sentiment score:</strong> {summary?.sentiment.score?.toFixed(2) ?? "0.00"}
            </p>
            <p>
              <strong>Spike detected:</strong> {summary?.spikeDetected ? "Yes" : "No"}
            </p>
            <p>
              <strong>Spikes (24h):</strong> {spikes?.last24hCount ?? 0}
            </p>
          </CardContent>
        </Card>
        <TopicWordCloud topics={topics} clusters={summary?.clusters} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">LLM Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm leading-relaxed text-muted-foreground">
          {summaryParagraphs.length > 0 ? (
            summaryParagraphs.slice(0, maxSummaryParagraphs).map((paragraph, index) => <p key={`summary-${index}`}>{paragraph}</p>)
          ) : (
            <p>No summary generated yet.</p>
          )}

          {clusterHighlights.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cluster highlights</h4>
              <ul className="mt-2 list-disc space-y-2 pl-4">
                {clusterHighlights.slice(0, maxClusterItems).map((cluster) => (
                  <li key={cluster.id}>
                    <span className="font-semibold">{cluster.label}</span>
                    {cluster.spike ? " 🔥" : ""} — {cluster.mentions} mentions
                  </li>
                ))}
              </ul>
            </div>
          )}

          {summary?.chunkSummaries && summary.chunkSummaries.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">LLM highlights</h4>
              <ul className="mt-2 list-disc space-y-2 pl-4">
                {summary.chunkSummaries.slice(0, maxChunkHighlights).map((item, index) => (
                  <li key={`chunk-${index}`}>{item}</li>
                ))}
              </ul>
            </div>
          )}

          {(summaryParagraphs.length > 2 || clusterHighlights.length > 3 || (summary?.chunkSummaries?.length ?? 0) > 3) && (
            <button
              type="button"
              className="text-xs font-medium text-primary hover:underline"
              onClick={() => setSummaryExpanded((prev) => !prev)}
            >
              {isSummaryExpanded ? "Show less" : "Show more"}
            </button>
          )}

          <div className="grid gap-1 text-xs text-muted-foreground">
            <span>
              <strong>Total mentions analysed:</strong> {summary?.totalMentions ?? 0}
            </span>
            <span>
              <strong>Total chunks processed:</strong> {summary?.totalChunks ?? 0}
            </span>
            <span>
              <strong>Generated at:</strong> {summary ? new Date(summary.generatedAt).toLocaleString() : "n/a"}
            </span>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <SentimentTrendChart data={sentimentTrend} />
        <SpikeTimelineChart data={spikeTimeline} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">API reference</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <ul className="grid gap-2 sm:grid-cols-2">
            <li>
              <code>GET /api/brands/:id/analytics</code> → Sentiment trend (7d), topic clusters, spike timeline.
            </li>
            <li>
              <code>GET /api/brands/:id/spikes</code> → Last 24 hours spike score timeline.
            </li>
            <li>
              <code>GET /api/brands/:id/summary</code> → Spike detection flag & LLM sentiment summary.
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
