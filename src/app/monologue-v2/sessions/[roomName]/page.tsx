import { notFound } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import {
  QuestionTimeline,
  HintTimeline,
} from "@/components/dashboard/EventTimeline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ExternalLink } from "lucide-react";

export const dynamic = "force-dynamic";

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

function buildPosthogUrl(roomName: string): string {
  const query = {
    kind: "DataTableNode",
    columns: [
      "*",
      "event",
      "person_display_name -- Person",
      "coalesce(properties.$current_url, properties.$screen_name) -- Url / Screen",
      "properties.$lib",
      "timestamp",
    ],
    hiddenColumns: [],
    pinnedColumns: [],
    source: {
      kind: "EventsQuery",
      select: [
        "*",
        "event",
        "person_display_name -- Person",
        "coalesce(properties.$current_url, properties.$screen_name) -- Url / Screen",
        "properties.$lib",
        "timestamp",
        "properties.question_count",
        "properties.total_count",
      ],
      orderBy: ["properties.question_count\n DESC"],
      after: "-7d",
      event: "",
      properties: [
        {
          key: "room_name",
          value: [roomName],
          operator: "exact",
          type: "event",
        },
      ],
    },
    context: { type: "team_columns" },
    allowSorting: true,
    embedded: false,
    expandable: true,
    full: true,
    propertiesViaUrl: true,
    showActions: true,
    showColumnConfigurator: true,
    showCount: false,
    showDateRange: true,
    showElapsedTime: false,
    showEventFilter: true,
    showEventsFilter: false,
    showExport: true,
    showHogQLEditor: true,
    showOpenEditorButton: true,
    showPersistentColumnConfigurator: true,
    showPropertyFilter: true,
    showRecordingColumn: false,
    showReload: true,
    showResultsTable: true,
    showSavedFilters: false,
    showSavedQueries: true,
    showSearch: true,
    showSourceQueryOptions: true,
    showTableViews: false,
    showTestAccountFilters: true,
    showTimings: false,
  };

  return `https://us.posthog.com/project/264307/activity/explore#q=${encodeURIComponent(
    JSON.stringify(query),
  )}`;
}

export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ roomName: string }>;
}) {
  const { roomName } = await params;

  const session = await prisma.session.findUnique({
    where: { roomName },
    include: {
      student: { select: { id: true, email: true, name: true } },
      activity: {
        select: { id: true, externalId: true, title: true, questionCount: true },
      },
      questionProgress: { orderBy: { completedAt: "asc" } },
      hintUsages: { orderBy: { requestedAt: "asc" } },
      _count: { select: { questionProgress: true } },
    },
  });

  if (!session) {
    notFound();
  }

  const durationMs =
    session.durationMs ??
    (session.endedAt
      ? new Date(session.endedAt).getTime() -
        new Date(session.startedAt).getTime()
      : null);

  const completedCount = session._count.questionProgress;
  const questionCount = session.activity?.questionCount ?? 0;
  const completionPct =
    questionCount > 0
      ? Math.round((completedCount / questionCount) * 100)
      : 0;

  const questions = session.questionProgress.map((q) => ({
    id: q.id,
    questionId: q.questionId,
    questionText: q.questionText,
    completedAt: q.completedAt.toISOString(),
    attemptNumber: q.attemptNumber,
  }));

  const hints = session.hintUsages.map((h) => ({
    id: h.id,
    questionId: h.questionId,
    questionText: h.questionText,
    hintText: h.hintText,
    agentResponse: h.agentResponse,
    userResponse: h.userResponse,
    cached: h.cached,
    requestedAt: h.requestedAt.toISOString(),
    revealedAt: h.revealedAt?.toISOString() || null,
    respondedAt: h.respondedAt?.toISOString() || null,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3">
          <Link
            href={`/monologue-v2/students/${session.student.id}`}
            className="text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">
                {session.activity?.title || "Session"}
              </h1>
              <Badge variant={statusVariant[session.status] || "outline"}>
                {session.status}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {session.student.name || session.student.email} &middot;{" "}
              {format(new Date(session.startedAt), "MMM d, yyyy HH:mm")}
            </p>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">
              {session.roomName}
            </p>
          </div>
        </div>
        <Button asChild variant="outline" size="sm" className="w-fit">
          <a
            href={buildPosthogUrl(session.roomName)}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink className="h-4 w-4" />
            Open in PostHog
          </a>
        </Button>
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{completionPct}%</div>
            <p className="text-xs text-muted-foreground">
              {completedCount}/{questionCount} questions
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Duration</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatDuration(durationMs)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Hints Used</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{hints.length}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="text-lg font-semibold mb-4">Questions Completed</h2>
          <QuestionTimeline questions={questions} />
        </div>
        <div>
          <h2 className="text-lg font-semibold mb-4">Hints</h2>
          <HintTimeline hints={hints} />
        </div>
      </div>
    </div>
  );
}
