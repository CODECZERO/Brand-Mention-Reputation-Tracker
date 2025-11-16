import { useParams } from "react-router-dom";

import { LiveMentionList } from "@/components/mentions/LiveMentionList";
import { LoadingState } from "@/components/shared/LoadingState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLiveMentions } from "@/hooks/useBrands";

export default function LiveMentionsPage() {
  const { brandId = "" } = useParams();
  const { data: mentions = [], isLoading, isError, error, refetch, isFetching } = useLiveMentions(brandId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">Live mentions</h2>
          <p className="text-sm text-muted-foreground">
            Polling <code>GET /api/brands/:id/live</code> every 10 seconds for fresh mentions.
          </p>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="inline-flex items-center rounded-md border border-input px-4 py-2 text-sm font-medium transition hover:bg-muted"
        >
          Refresh now
        </button>
      </div>

      {isLoading && <LoadingState message="Loading live mentions..." />}

      {isError && (
        <Card className="border-destructive/50">
          <CardContent className="p-4 text-sm text-destructive">
            {error?.message ?? "Failed to load mentions."}
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && <LiveMentionList mentions={mentions} grouped />}
    </div>
  );
}
