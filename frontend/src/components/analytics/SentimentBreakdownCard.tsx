import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface SentimentBreakdownCardProps {
  positive: number;
  neutral: number;
  negative: number;
}

export function SentimentBreakdownCard({ positive, neutral, negative }: SentimentBreakdownCardProps) {
  const total = positive + neutral + negative;
  const positivePct = total > 0 ? (positive / total) * 100 : 0;
  const neutralPct = total > 0 ? (neutral / total) * 100 : 0;
  const negativePct = total > 0 ? (negative / total) * 100 : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">Sentiment breakdown</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          <span className="h-3 w-full rounded-full bg-emerald-500" style={{ width: `${positivePct}%` }} />
          <span className="text-xs text-muted-foreground">Positive {positivePct.toFixed(1)}%</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="h-3 w-full rounded-full bg-slate-400" style={{ width: `${neutralPct}%` }} />
          <span className="text-xs text-muted-foreground">Neutral {neutralPct.toFixed(1)}%</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="h-3 w-full rounded-full bg-rose-500" style={{ width: `${negativePct}%` }} />
          <span className="text-xs text-muted-foreground">Negative {negativePct.toFixed(1)}%</span>
        </div>
      </CardContent>
    </Card>
  );
}
