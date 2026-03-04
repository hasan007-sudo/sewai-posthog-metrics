import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface ActivityCompletionBin {
  completionPct: number;
  sessionCount: number;
}

interface ActivityCompletionBarChartProps {
  bins: ActivityCompletionBin[];
}

export function ActivityCompletionBarChart({
  bins,
}: ActivityCompletionBarChartProps) {
  const maxCount = bins.reduce(
    (max, bin) => (bin.sessionCount > max ? bin.sessionCount : max),
    0,
  );
  const totalSessions = bins.reduce((sum, bin) => sum + bin.sessionCount, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity Completion (%)</CardTitle>
        <p className="text-sm text-muted-foreground">
          Sessions grouped by question completion percentage (for sessions with
          known total questions).
        </p>
      </CardHeader>
      <CardContent>
        {bins.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No completion-distribution data available yet.
          </p>
        ) : (
          <div className="space-y-3">
            {bins.map((bin) => {
              const widthPct =
                maxCount > 0
                  ? Math.max(4, Math.round((bin.sessionCount / maxCount) * 100))
                  : 0;
              const sharePct =
                totalSessions > 0
                  ? Math.round((bin.sessionCount / totalSessions) * 1000) / 10
                  : 0;

              return (
                <div
                  key={`${bin.completionPct}-${bin.sessionCount}`}
                  className="grid grid-cols-[64px_1fr_auto] items-center gap-3"
                >
                  <span className="text-sm font-medium">{bin.completionPct}%</span>
                  <div className="h-3 w-full rounded-full bg-muted">
                    <div
                      className="h-3 rounded-full bg-primary"
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                  <span className="text-sm text-muted-foreground whitespace-nowrap">
                    {bin.sessionCount} sessions ({sharePct}%)
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
