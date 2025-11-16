import { useMemo, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ClusterSummary } from "@/types/api";

interface TopicWordCloudProps {
  topics: { term: string; weight: number }[];
  clusters?: ClusterSummary[];
}

export function TopicWordCloud({ topics, clusters }: TopicWordCloudProps) {
  const hasTopics = topics.length > 0;
  const [selectedTerm, setSelectedTerm] = useState<string | null>(null);

  const clusterLookup = useMemo(() => {
    if (!clusters) {
      return new Map<string, ClusterSummary>();
    }

    const map = new Map<string, ClusterSummary>();
    clusters.forEach((cluster) => {
      map.set(normalizeLabel(cluster.label), cluster);
    });
    return map;
  }, [clusters]);

  const selectedTopic = useMemo(() => {
    if (!selectedTerm) {
      return null;
    }
    return topics.find((topic) => normalizeLabel(topic.term) === selectedTerm) ?? null;
  }, [selectedTerm, topics]);

  const selectedCluster = useMemo(() => {
    if (!selectedTopic) {
      return null;
    }
    return clusterLookup.get(normalizeLabel(selectedTopic.term)) ?? null;
  }, [clusterLookup, selectedTopic]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">Topic clusters</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex h-64 flex-wrap items-start justify-center gap-3 overflow-auto">
          {hasTopics ? (
            topics.map((topic) => {
              const normalizedTerm = normalizeLabel(topic.term);
              const isSelected = normalizedTerm === selectedTerm;
            const fontSize = Math.max(topic.weight * 42, 14);
            const label = truncateTopic(topic.term);
            return (
                <button
                  key={`${topic.term}-${fontSize}`}
                  type="button"
                  onClick={() => setSelectedTerm((prev) => (prev === normalizedTerm ? null : normalizedTerm))}
                  className={`max-w-xs truncate rounded-full px-3 py-1 text-primary transition focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
                    isSelected ? "bg-primary text-primary-foreground" : "bg-primary/10 hover:bg-primary/20"
                  }`}
                  style={{ fontSize: `${fontSize}px`, lineHeight: 1.3 }}
                  title={topic.term}
                >
                  {label}
                </button>
            );
          })
          ) : (
            <span className="text-sm text-muted-foreground">No topic clusters generated yet.</span>
          )}
        </div>

        {selectedTopic && (
          <div className="rounded-md border border-border bg-muted/40 p-4 text-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h4 className="text-sm font-semibold text-foreground">{selectedTopic.term}</h4>
                <p className="text-xs text-muted-foreground">
                  Relative weight: {formatWeight(selectedTopic.weight)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTerm(null)}
                className="text-xs font-medium text-primary hover:underline"
              >
                Clear
              </button>
            </div>

            {selectedCluster ? (
              <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                <li>
                  <strong>Mentions:</strong> {selectedCluster.mentions}
                </li>
                <li>
                  <strong>Spike detected:</strong> {selectedCluster.spike ? "Yes 🔥" : "No"}
                </li>
              </ul>
            ) : (
              <p className="mt-3 text-xs text-muted-foreground">No detailed cluster summary available.</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function truncateTopic(text: string, maxLength = 60): string {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 1)}…`;
}

function normalizeLabel(text: string): string {
  return text.trim().toLowerCase();
}

function formatWeight(weight: number): string {
  if (!Number.isFinite(weight)) {
    return "n/a";
  }
  if (weight > 1) {
    return weight.toFixed(2);
  }
  return `${(weight * 100).toFixed(1)}%`;
}
