"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Users,
  BookOpen,
  CheckCircle,
  Lightbulb,
  CircleCheckBig,
  Clock3,
  Languages,
  Trophy,
  AlertCircle,
} from "lucide-react";

interface Stats {
  totalStudents: number;
  totalSessions: number;
  sessionsByStatus: { STARTED: number; ENDED: number; ABANDONED: number };
  totalQuestionsCompleted: number;
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
      title: "Questions Completed",
      value: stats.totalQuestionsCompleted,
      description: `${stats.avgQuestionsPerSession.toFixed(1)} avg/session`,
      icon: CheckCircle,
    },
    {
      title: "Hints Used",
      value: stats.totalHintUsages,
      icon: Lightbulb,
    },
    {
      title: "Ended Conversations",
      value: stats.outcomes.endedConversations.count,
      description: `${stats.outcomes.endedConversations.pct.toFixed(1)}% of started`,
      icon: CircleCheckBig,
    },
    {
      title: "Not Ended (24h+)",
      value: stats.outcomes.notEndedStale.count,
      description: `${stats.outcomes.notEndedStale.pct.toFixed(1)}% of started`,
      icon: Clock3,
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
      title: "Completed All Questions & Ended",
      value: stats.outcomes.completedAllAndEnded.count,
      description: `${stats.outcomes.completedAllAndEnded.pct.toFixed(1)}% of started`,
      icon: Trophy,
    },
    {
      title: "Sessions Ended Before Q1 Complete",
      value: stats.outcomes.endedBeforeQ1Complete.count,
      description: `${stats.outcomes.endedBeforeQ1Complete.pct.toFixed(1)}% of started`,
      icon: AlertCircle,
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
