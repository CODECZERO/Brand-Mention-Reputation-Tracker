import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type SpikeSample } from "@/types/api";

interface SpikeTimelineChartProps {
  data: SpikeSample[];
}

export function SpikeTimelineChart({ data }: SpikeTimelineChartProps) {
  const hasData = data.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">Spike timeline (24h)</CardTitle>
      </CardHeader>
      <CardContent className="h-72">
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ left: 0, right: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="timestamp" tick={{ fontSize: 12 }} minTickGap={24} />
              <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
              <Tooltip formatter={(value: number) => value.toFixed(0)} />
              <Line type="monotone" dataKey="spikeScore" stroke="#ef4444" dot={false} strokeWidth={2} />
              <Line type="monotone" dataKey="threshold" stroke="#6366f1" dot={false} strokeDasharray="4 4" />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No spike data available.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
