import { useMemo } from "react";
import { useParams } from "react-router-dom";

import { SummaryCards } from "@/components/dashboard/SummaryCards";
import { LoadingState } from "@/components/shared/LoadingState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LiveMentionList } from "@/components/mentions/LiveMentionList";
import { SentimentTrendChart } from "@/components/charts/SentimentTrendChart";
import { SpikeTimelineChart } from "@/components/charts/SpikeTimelineChart";
import { useBrandAnalytics, useBrandSpikes, useBrandSummary, useLiveMentions } from "@/hooks/useBrands";

export default function BrandDashboardPage() {
  const { brandId = "" } = useParams();

  const { data: summary, isLoading: summaryLoading } = useBrandSummary(brandId);
  const { data: spikes, isLoading: spikesLoading } = useBrandSpikes(brandId);
  const { data: mentions, isLoading: mentionsLoading } = useLiveMentions(brandId);
  const { data: analytics, isLoading: analyticsLoading } = useBrandAnalytics(brandId);

  const sentimentTrend = useMemo(() => analytics?.sentimentTrend ?? [], [analytics]);
  const spikeTimeline = useMemo(() => spikes?.timeline ?? [], [spikes]);

  const isLoading = summaryLoading && spikesLoading && mentionsLoading;

  if (isLoading) {
    return <LoadingState message="Loading brand dashboard..." />;
  }

  return (
    <div className="space-y-6">
      <SummaryCards summary={summary} spikes={spikes} mentions={mentions} />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Live mentions feed</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {mentionsLoading && <LoadingState message="Loading mentions..." />}
            {!mentionsLoading && mentions && <LiveMentionList mentions={mentions} />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Latest summary</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {summary?.sentimentSummary ?? "No summary generated yet."}
            </p>
            <div className="mt-4 space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Top topics</h4>
              <div className="flex flex-wrap gap-2">
                {(summary?.topics ?? []).map((topic) => (
                  <span key={topic} className="rounded-full bg-primary/10 px-3 py-1 text-xs text-primary">
                    #{topic}
                  </span>
                ))}
                {!summary?.topics?.length && (
                  <span className="text-xs text-muted-foreground">Topics will appear once analysis runs.</span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <SentimentTrendChart data={sentimentTrend} />
        <SpikeTimelineChart data={spikeTimeline} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Data freshness</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="max-h-36">
            <ul className="list-disc space-y-2 pl-6 text-sm text-muted-foreground">
              <li>
                <strong>/api/brands/:id/summary</strong> → Spike score {summary?.spikeScore ?? 0} & topics from LLM
                service.
              </li>
              <li>
                <strong>/api/brands/:id/live</strong> → {mentions?.length ?? 0} mentions fetched from Redis (last 60
                minutes).
              </li>
              <li>
                <strong>/api/brands/:id/spikes</strong> → {spikes?.last24hCount ?? 0} spikes detected over previous 24
                hours.
              </li>
            </ul>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
