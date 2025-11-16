import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type SentimentTrendPoint } from "@/types/api";

interface SentimentTrendChartProps {
  data: SentimentTrendPoint[];
}

export function SentimentTrendChart({ data }: SentimentTrendChartProps) {
  const hasData = data.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">Sentiment trend (7 days)</CardTitle>
      </CardHeader>
      <CardContent className="h-72">
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ left: 0, right: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
              <Tooltip cursor={{ strokeDasharray: "3 3" }} />
              <Area type="monotone" dataKey="positive" stroke="#16a34a" fill="#16a34a22" name="Positive" />
              <Area type="monotone" dataKey="neutral" stroke="#6b7280" fill="#6b728022" name="Neutral" />
              <Area type="monotone" dataKey="negative" stroke="#dc2626" fill="#dc262622" name="Negative" />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No sentiment data available.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
