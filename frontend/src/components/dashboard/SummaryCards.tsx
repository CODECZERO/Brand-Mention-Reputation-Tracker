import { Flame, MessageSquare, TrendingUp } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  type BrandSummaryResponse,
  type BrandSpikesResponse,
  type LiveMentionsResponse,
  type SentimentTrendPoint,
  type SpikeSample,
} from "@/types/api";

interface SummaryCardsProps {
  summary?: BrandSummaryResponse;
  spikes?: BrandSpikesResponse;
  mentions?: LiveMentionsResponse;
  sentimentTrend?: SentimentTrendPoint[];
  spikeTimeline?: SpikeSample[];
  onViewAnalytics?: () => void;
  onViewLiveMentions?: () => void;
  onViewSpikes?: () => void;
}

export function SummaryCards({
  summary,
  spikes,
  mentions,
  sentimentTrend,
  spikeTimeline,
  onViewAnalytics,
  onViewLiveMentions,
  onViewSpikes,
}: SummaryCardsProps) {
  const spikeScore = summary?.sentiment?.score ?? 0;
  const spikeDetected = summary?.spikeDetected ?? false;
  const mentionCount = mentions?.length ?? 0;
  const last24Count = spikes?.last24hCount ?? 0;
  const sentiment = summary?.sentiment;
  const totalSentiment = (sentiment?.positive ?? 0) + (sentiment?.neutral ?? 0) + (sentiment?.negative ?? 0);
  const positivePct = totalSentiment > 0 ? ((sentiment?.positive ?? 0) / totalSentiment) * 100 : 0;
  const neutralPct = totalSentiment > 0 ? ((sentiment?.neutral ?? 0) / totalSentiment) * 100 : 0;
  const negativePct = totalSentiment > 0 ? ((sentiment?.negative ?? 0) / totalSentiment) * 100 : 0;
  const previousTrendScore = computeTrendScore(sentimentTrend);
  const sentimentDelta = previousTrendScore != null ? spikeScore - previousTrendScore : null;
  const sentimentDeltaLabel =
    sentimentDelta != null && Math.abs(sentimentDelta) >= 0.01
      ? `${sentimentDelta > 0 ? "▲" : "▼"} ${Math.abs(sentimentDelta).toFixed(2)}`
      : null;
  const sentimentDeltaClass =
    sentimentDelta != null ? (sentimentDelta > 0 ? "text-emerald-500" : "text-rose-500") : undefined;
  const lastUpdated = summary?.generatedAt
    ? formatDistanceToNow(new Date(summary.generatedAt), { addSuffix: true })
    : null;

  const lastSpikeEvent = getLatestSpike(spikeTimeline);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent">
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Sentiment Overview</CardTitle>
          <TrendingUp className="h-4 w-4 text-primary" />
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-3xl font-semibold">{spikeScore.toFixed(1)}</p>
          <div className="grid gap-1 text-xs text-muted-foreground">
            <span>Positive: {positivePct.toFixed(1)}%</span>
            <span>Neutral: {neutralPct.toFixed(1)}%</span>
            <span>Negative: {negativePct.toFixed(1)}%</span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>{lastUpdated ? `Updated ${lastUpdated}` : "Awaiting latest summary"}</span>
            {sentimentDeltaLabel && <span className={sentimentDeltaClass}>{sentimentDeltaLabel}</span>}
          </div>
          {onViewAnalytics && (
            <Button variant="ghost" size="sm" className="px-0 text-xs" onClick={onViewAnalytics}>
              View analytics →
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Live Mentions (60m)</CardTitle>
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-semibold">{mentionCount}</p>
          <p className="mt-1 text-xs text-muted-foreground">New mentions captured across all sources.</p>
          {onViewLiveMentions && (
            <Button variant="ghost" size="sm" className="px-0 text-xs" onClick={onViewLiveMentions}>
              Open live feed →
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Spike Detection</CardTitle>
          <Flame className={spikeDetected ? "h-4 w-4 text-destructive" : "h-4 w-4 text-muted-foreground"} />
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-3xl font-semibold">{spikeDetected ? "Spike" : "Stable"}</p>
          <p className="text-xs text-muted-foreground">Score: {spikeScore.toFixed(1)}</p>
          <p className="text-xs text-muted-foreground">
            {lastSpikeEvent
              ? `Last spike ${formatDistanceToNow(new Date(lastSpikeEvent.timestamp), { addSuffix: true })}`
              : "No spikes detected in the timeline."}
          </p>
          {onViewSpikes && (
            <Button variant="ghost" size="sm" className="px-0 text-xs" onClick={onViewSpikes}>
              Inspect spike timeline →
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Spikes (24h)</CardTitle>
          <Flame className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-semibold">{last24Count}</p>
          <p className="mt-1 text-xs text-muted-foreground">Detected spikes in the last 24 hours.</p>
          {lastSpikeEvent && (
            <p className="text-xs text-muted-foreground">
              Peak mentions: {lastSpikeEvent.mentionCount} (threshold {lastSpikeEvent.threshold})
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function computeTrendScore(trend?: SentimentTrendPoint[]): number | null {
  if (!trend || trend.length < 2) {
    return null;
  }
  const previous = trend[trend.length - 2];
  if (!previous) {
    return null;
  }
  return previous.positive - previous.negative;
}

function getLatestSpike(spikeTimeline?: SpikeSample[]): SpikeSample | null {
  if (!spikeTimeline || spikeTimeline.length === 0) {
    return null;
  }
  const reversed = [...spikeTimeline].reverse();
  return reversed.find((entry) => entry.spikeScore >= entry.threshold) ?? reversed[0] ?? null;
}
