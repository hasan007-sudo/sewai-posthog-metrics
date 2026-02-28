import { notFound } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import {
  QuestionTimeline,
  HintTimeline,
  RawEventTimeline,
} from "@/components/dashboard/EventTimeline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft } from "lucide-react";

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
      rawEvents: { orderBy: { timestamp: "asc" } },
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

  const completionPct =
    session.questionCount > 0
      ? Math.round((session.completedCount / session.questionCount) * 100)
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

  const rawEvents = session.rawEvents.map((e) => ({
    id: e.id,
    eventType: e.eventType,
    timestamp: e.timestamp.toISOString(),
    properties: e.properties as Record<string, unknown>,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href={`/students/${session.student.id}`}
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

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{completionPct}%</div>
            <p className="text-xs text-muted-foreground">
              {session.completedCount}/{session.questionCount} questions
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
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Events</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{rawEvents.length}</div>
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

      <div>
        <h2 className="text-lg font-semibold mb-4">Event Log</h2>
        <RawEventTimeline events={rawEvents} />
      </div>
    </div>
  );
}
