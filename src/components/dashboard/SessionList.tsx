"use client";

import Link from "next/link";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";

interface SessionRow {
  id: string;
  roomName: string;
  activity: { id: string; title: string } | null;
  status: string;
  startedAt: string;
  endedAt: string | null;
  questionCount: number;
  completedCount: number;
  durationMs: number | null;
}

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  STARTED: "outline",
  ENDED: "default",
  ABANDONED: "destructive",
};

function formatDuration(ms: number | null): string {
  if (!ms) return "-";
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes === 0) return `${remainingSeconds}s`;
  return `${minutes}m ${remainingSeconds}s`;
}

export function SessionList({ sessions }: { sessions: SessionRow[] }) {
  if (sessions.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No sessions found.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {sessions.map((session) => {
        const completionPct =
          session.questionCount > 0
            ? Math.round((session.completedCount / session.questionCount) * 100)
            : 0;

        return (
          <Link
            key={session.id}
            href={`/monologue-v2/sessions/${session.roomName}`}
            className="block border rounded-lg p-4 hover:bg-accent/50 transition-colors"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">
                  {session.activity?.title || "Unknown Activity"}
                </span>
                <Badge variant={statusVariant[session.status] || "outline"}>
                  {session.status}
                </Badge>
              </div>
              <span className="text-xs text-muted-foreground">
                {format(new Date(session.startedAt), "MMM d, yyyy HH:mm")}
              </span>
            </div>
            <div className="flex gap-4 text-xs text-muted-foreground">
              <span>
                Questions: {session.completedCount}/{session.questionCount} ({completionPct}%)
              </span>
              <span>Duration: {formatDuration(session.durationMs)}</span>
              <span className="font-mono text-[10px]">{session.roomName}</span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
