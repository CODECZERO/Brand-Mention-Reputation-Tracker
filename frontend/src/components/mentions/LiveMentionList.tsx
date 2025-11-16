import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { formatDistanceToNow } from "date-fns";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { SENTIMENT_COLORS } from "@/lib/utils";
import { type LiveMentionsResponse, type Mention } from "@/types/api";

interface LiveMentionListProps {
  mentions: LiveMentionsResponse;
  grouped?: boolean;
  brandId?: string;
}

export function LiveMentionList({ mentions, grouped = false, brandId }: LiveMentionListProps) {
  const [sentimentFilter, setSentimentFilter] = useState<"all" | "positive" | "neutral" | "negative">("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [visibleCount, setVisibleCount] = useState(10);
  const navigate = useNavigate();
  const { brandId: routeBrandId = "" } = useParams();
  const resolvedBrandId = brandId ?? routeBrandId;

  const handleSelectMention = useCallback(
    (mention: Mention) => {
      if (!resolvedBrandId) {
        return;
      }
      navigate(`/brands/${resolvedBrandId}/live/${mention.id}`);
    },
    [navigate, resolvedBrandId],
  );

  useEffect(() => {
    setVisibleCount(10);
  }, [sentimentFilter, sourceFilter, mentions]);

  const availableSources = useMemo(() => {
    const unique = new Set<string>();
    mentions.forEach((mention) => unique.add(mention.source));
    return Array.from(unique);
  }, [mentions]);

  const filteredMentions = useMemo(() => {
    return mentions.filter((mention) => {
      const sentimentMatches = sentimentFilter === "all" || mention.sentiment === sentimentFilter;
      const sourceMatches = sourceFilter === "all" || mention.source === sourceFilter;
      return sentimentMatches && sourceMatches;
    });
  }, [mentions, sentimentFilter, sourceFilter]);

  const visibleMentions = filteredMentions.slice(0, visibleCount);

  const noMentions = visibleMentions.length === 0;

  if (!mentions.length) {
    return (
      <Card>
        <CardContent className="flex h-40 items-center justify-center text-sm text-muted-foreground">
          No live mentions fetched yet.
        </CardContent>
      </Card>
    );
  }

  const FilterControls = (
    <div className="mb-3 flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <span>Sentiment</span>
        {(["all", "positive", "neutral", "negative"] as const).map((option) => {
          const isActive = sentimentFilter === option;
          return (
            <button
              key={option}
              type="button"
              className={`rounded-full px-3 py-1 text-xs transition ${
                isActive ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"
              }`}
              onClick={() => setSentimentFilter(option)}
            >
              {option === "all" ? "All" : option.charAt(0).toUpperCase() + option.slice(1)}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <label htmlFor="source-filter">Source</label>
        <select
          id="source-filter"
          value={sourceFilter}
          onChange={(event) => setSourceFilter(event.target.value)}
          className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
        >
          <option value="all">All</option>
          {availableSources.map((source) => (
            <option key={source} value={source}>
              {source}
            </option>
          ))}
        </select>
      </div>
    </div>
  );

  if (grouped) {
    const groups = visibleMentions.reduce<Record<string, LiveMentionsResponse>>((acc, mention) => {
      if (!acc[mention.source]) acc[mention.source] = [];
      acc[mention.source].push(mention);
      return acc;
    }, {});

    return (
      <div>
        {FilterControls}
        <div className="space-y-4">
          {Object.entries(groups).map(([source, sourceMentions]) => (
            <Card key={source}>
              <CardContent className="p-4">
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {source}
                </h3>
                <SourceMentionsList mentions={sourceMentions} onSelect={handleSelectMention} />
              </CardContent>
            </Card>
          ))}
        </div>
        <LoadMoreButton
          canLoadMore={filteredMentions.length > visibleMentions.length}
          onLoadMore={() => setVisibleCount((count) => count + 10)}
        />
      </div>
    );
  }

  return (
    <Card>
      <CardContent className="p-4">
        {FilterControls}
        {noMentions ? (
          <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
            No mentions match the selected filters.
          </div>
        ) : (
          <ScrollArea className="max-h-[480px]">
            <SourceMentionsList mentions={visibleMentions} onSelect={handleSelectMention} />
          </ScrollArea>
        )}
        <LoadMoreButton
          canLoadMore={filteredMentions.length > visibleMentions.length}
          onLoadMore={() => setVisibleCount((count) => count + 10)}
        />
      </CardContent>
    </Card>
  );
}

function SourceMentionsList({ mentions, onSelect }: { mentions: LiveMentionsResponse; onSelect?: (mention: Mention) => void }) {
  return (
    <ul className="divide-y divide-border">
      {mentions.map((mention) => {
        const sentimentClass = SENTIMENT_COLORS[mention.sentiment] ?? "text-slate-500";
        return (
          <li key={mention.id}>
            <button
              type="button"
              onClick={() => onSelect?.(mention)}
              className="w-full p-4 text-left transition hover:bg-muted focus:outline-none focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-primary"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                  <Badge variant="secondary" className="bg-muted text-muted-foreground">
                    {mention.source}
                  </Badge>
                  <span className={sentimentClass}>{mention.sentiment}</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(mention.createdAt), { addSuffix: true })}
                </span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-foreground">{mention.text}</p>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function LoadMoreButton({ canLoadMore, onLoadMore }: { canLoadMore: boolean; onLoadMore: () => void }) {
  if (!canLoadMore) {
    return null;
  }
  return (
    <div className="mt-3 flex justify-center">
      <Button variant="outline" size="sm" onClick={onLoadMore}>
        Load more mentions
      </Button>
    </div>
  );
}
