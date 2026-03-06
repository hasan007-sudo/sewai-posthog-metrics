"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Users,
  BookOpen,
  Lightbulb,
  Languages,
  Timer,
} from "lucide-react";

interface Stats {
  totalStudents: number;
  totalSessions: number;
  sessionsByStatus: { STARTED: number; ENDED: number; ABANDONED: number };
  totalQuestionsCompleted: number;
  totalDurationMs: number;
  avgQuestionsPerSession: number;
  totalHintUsages: number;
  outcomes: {
    endedConversations: { count: number; pct: number };
    notEndedStale: { count: number; pct: number };
    hintUsedAtLeastOnce: { count: number; pct: number };
    translateUsedAtLeastOnce: { count: number; pct: number };
    completedAllAndEnded: { count: number; pct: number };
    endedBeforeQ1Complete: { count: number; pct: number };
  };
}

function formatDuration(ms: number): string {
  if (ms <= 0) {
    return "0s";
  }

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
}

export function StatsCards({ stats }: { stats: Stats }) {
  const cards = [
    {
      title: "Total Students",
      value: stats.totalStudents,
      icon: Users,
    },
    {
      title: "Total Sessions",
      value: stats.totalSessions,
      description: `${stats.sessionsByStatus.STARTED} started, ${stats.sessionsByStatus.ENDED} ended`,
      icon: BookOpen,
    },
    {
      title: "Hint Used >=1",
      value: stats.outcomes.hintUsedAtLeastOnce.count,
      description: `${stats.outcomes.hintUsedAtLeastOnce.pct.toFixed(1)}% of started`,
      icon: Lightbulb,
    },
    {
      title: "Translate Used >=1",
      value: stats.outcomes.translateUsedAtLeastOnce.count,
      description: `${stats.outcomes.translateUsedAtLeastOnce.pct.toFixed(1)}% of started`,
      icon: Languages,
    },
    {
      title: "Total Duration",
      value: formatDuration(stats.totalDurationMs),
      icon: Timer,
    },
  ];

  return (
    <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
      {cards.map((card) => (
        <Card key={card.title}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
            <card.icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{card.value}</div>
            {card.description && (
              <p className="text-xs text-muted-foreground mt-1">
                {card.description}
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
