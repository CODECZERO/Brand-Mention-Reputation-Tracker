import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { formatDistanceToNow } from "date-fns";

import { LoadingState } from "@/components/shared/LoadingState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLiveMentions } from "@/hooks/useBrands";
import { SENTIMENT_COLORS } from "@/lib/utils";

export default function LiveMentionDetailPage() {
  const navigate = useNavigate();
  const { brandId = "", mentionId = "" } = useParams();
  const {
    data: mentions = [],
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useLiveMentions(brandId);

  const mention = useMemo(() => mentions.find((item) => item.id === mentionId) ?? null, [mentions, mentionId]);

  if (isLoading) {
    return <LoadingState message="Loading mention details..." />;
  }

  if (isError) {
    return (
      <Card className="border-destructive/50">
        <CardContent className="space-y-3 p-4 text-sm text-destructive">
          <p>{error?.message ?? "Failed to load mention details."}</p>
          <Button variant="secondary" size="sm" onClick={() => refetch()} disabled={isFetching}>
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!mention) {
    return (
      <Card>
        <CardContent className="space-y-4 p-6 text-sm text-muted-foreground">
          <p>We couldn&apos;t find that live mention. It may have expired or been filtered out.</p>
          <Button variant="secondary" onClick={() => navigate(`/brands/${brandId}/live`)}>
            Back to live mentions
          </Button>
        </CardContent>
      </Card>
    );
  }

  const sentimentClass = SENTIMENT_COLORS[mention.sentiment] ?? "text-slate-500";
  const metadataEntries = Object.entries(mention.metadata ?? {}).filter(([key, value]) => Boolean(value));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">Live mention detail</h2>
          <p className="text-sm text-muted-foreground">Captured {formatDistanceToNow(new Date(mention.createdAt), { addSuffix: true })}</p>
        </div>
        <Button variant="outline" onClick={() => navigate(`/brands/${brandId}/live`)}>
          Back to live feed
        </Button>
      </div>

      <Card>
        <CardHeader className="space-y-3">
          <CardTitle className="flex flex-wrap items-center gap-3 text-base font-semibold">
            <Badge variant="secondary" className="bg-muted text-muted-foreground">
              {mention.source}
            </Badge>
            <span className={sentimentClass}>{mention.sentiment}</span>
          </CardTitle>
          <p className="text-sm text-muted-foreground">Mention ID: {mention.id}</p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-md border border-border bg-muted/30 p-4 text-sm leading-relaxed text-foreground">
            {mention.text}
          </div>

          {metadataEntries.length > 0 && (
            <div className="space-y-2 text-sm">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Metadata</h3>
              <dl className="grid gap-2 sm:grid-cols-2">
                {metadataEntries.map(([key, value]) => {
                  const formatted = formatMetadataValue(value);
                  const isMultiline = /\n/.test(formatted);
                  return (
                    <div key={key} className="rounded-md border border-border bg-background/60 p-3">
                      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{key}</dt>
                      <dd className="text-sm text-foreground break-words">
                        {isMultiline ? (
                          <pre className="whitespace-pre-wrap break-words text-xs md:text-sm">{formatted}</pre>
                        ) : (
                          formatted
                        )}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function formatMetadataValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "—";
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
      try {
        const parsed = JSON.parse(trimmed);
        return JSON.stringify(parsed, null, 2);
      } catch (error) {
        // fall back to original string
      }
    }
    return value;
  }

  if (typeof value === "object") {
    try {
      return JSON.stringify(value, null, 2);
    } catch (error) {
      return String(value);
    }
  }

  return String(value);
}
