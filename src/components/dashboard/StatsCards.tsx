"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, BookOpen, CheckCircle, MousePointerClick, Lightbulb, BarChart3 } from "lucide-react";

interface Stats {
  totalStudents: number;
  totalSessions: number;
  sessionsByStatus: { STARTED: number; ENDED: number; ABANDONED: number };
  totalQuestionsCompleted: number;
  avgQuestionsPerSession: number;
  avgCompletionRate: number;
  totalNextActivityClicks: number;
  totalHintUsages: number;
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
      description: `${stats.sessionsByStatus.ENDED} ended, ${stats.sessionsByStatus.STARTED} active`,
      icon: BookOpen,
    },
    {
      title: "Questions Completed",
      value: stats.totalQuestionsCompleted,
      description: `${stats.avgQuestionsPerSession.toFixed(1)} avg/session`,
      icon: CheckCircle,
    },
    {
      title: "Completion Rate",
      value: `${stats.avgCompletionRate}%`,
      description: "Avg for ended sessions",
      icon: BarChart3,
    },
    {
      title: "Next Activity Clicks",
      value: stats.totalNextActivityClicks,
      icon: MousePointerClick,
    },
    {
      title: "Hints Used",
      value: stats.totalHintUsages,
      icon: Lightbulb,
    },
  ];

  return (
    <div className="grid gap-4 grid-cols-2 lg:grid-cols-3">
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
