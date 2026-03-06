"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CompletionBand, CompletionBandLabel } from "@/lib/completion-bands";

interface QuestionCompletionBandChartProps {
  bands: CompletionBand[];
  isLoading: boolean;
  selectedBand: CompletionBandLabel | "all";
  onBandClick: (band: CompletionBandLabel) => void;
}

export function QuestionCompletionBandChart({
  bands,
  isLoading,
  selectedBand,
  onBandClick,
}: QuestionCompletionBandChartProps) {
  const totalSessions = bands.reduce((sum, band) => sum + band.sessionCount, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Question Completion Bands</CardTitle>
        <p className="text-sm text-muted-foreground">
          Session distribution by completed questions percentage.
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }, (_, index) => (
              <div
                key={`completion-band-skeleton-${index}`}
                className="grid grid-cols-[72px_1fr_auto] items-center gap-3"
              >
                <div className="h-4 w-12 animate-pulse rounded bg-muted" />
                <div className="h-3 w-full animate-pulse rounded-full bg-muted" />
                <div className="h-4 w-28 animate-pulse rounded bg-muted" />
              </div>
            ))}
          </div>
        ) : totalSessions === 0 ? (
          <p className="text-sm text-muted-foreground">
            No completion-distribution data available yet.
          </p>
        ) : (
          <div className="space-y-3">
            {bands.map((band) => (
              <button
                key={band.label}
                type="button"
                className={`grid w-full grid-cols-[72px_1fr_auto] items-center gap-3 rounded-md px-1 py-1 text-left ${
                  selectedBand === band.label ? "bg-muted/50" : "hover:bg-muted/30"
                }`}
                onClick={() => onBandClick(band.label)}
              >
                <span className="text-sm font-medium">{band.label}</span>
                <div className="h-3 w-full rounded-full bg-muted">
                  <div
                    className={`h-3 rounded-full ${
                      selectedBand === band.label ? "bg-primary" : "bg-primary/60"
                    }`}
                    style={{ width: `${band.sharePct}%` }}
                  />
                </div>
                <span className="text-sm text-muted-foreground whitespace-nowrap">
                  {band.sessionCount} sessions ({band.sharePct.toFixed(1)}%)
                </span>
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
