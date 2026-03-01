import { notFound } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { SessionList } from "@/components/dashboard/SessionList";
import { HintTimeline } from "@/components/dashboard/EventTimeline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function StudentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const student = await prisma.student.findUnique({
    where: { id },
    include: {
      sessions: {
        orderBy: { startedAt: "desc" },
        include: {
          activity: { select: { id: true, title: true } },
        },
      },
      hintUsages: {
        orderBy: { requestedAt: "desc" },
        include: {
          session: { select: { roomName: true } },
          activity: { select: { id: true, title: true } },
        },
      },
    },
  });

  if (!student) {
    notFound();
  }

  const totalSessions = student.sessions.length;
  const totalQuestions = student.sessions.reduce(
    (sum, s) => sum + s.completedCount,
    0
  );
  const endedWithQuestions = student.sessions.filter(
    (s) => s.status === "ENDED" && s.questionCount > 0
  );
  const avgCompletionRate =
    endedWithQuestions.length > 0
      ? endedWithQuestions.reduce(
          (sum, s) => sum + s.completedCount / s.questionCount,
          0
        ) / endedWithQuestions.length
      : 0;

  const sessions = student.sessions.map((s) => ({
    id: s.id,
    roomName: s.roomName,
    activity: s.activity,
    status: s.status,
    startedAt: s.startedAt.toISOString(),
    endedAt: s.endedAt?.toISOString() || null,
    questionCount: s.questionCount,
    completedCount: s.completedCount,
    durationMs: s.durationMs,
  }));

  const hintUsages = student.hintUsages.map((h) => ({
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
      <div className="flex items-center gap-3">
        <Link href="/monologue-v2/" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold">
            {student.name || student.email}
          </h1>
          {student.name && (
            <p className="text-sm text-muted-foreground">{student.email}</p>
          )}
          <p className="text-xs text-muted-foreground">
            Joined {format(student.createdAt, "MMM d, yyyy")}
          </p>
        </div>
      </div>

      <div className="grid gap-4 grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Sessions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalSessions}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Questions Completed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalQuestions}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Avg Completion</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {Math.round(avgCompletionRate * 100)}%
            </div>
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-4">Sessions</h2>
        <SessionList sessions={sessions} />
      </div>

      {hintUsages.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-lg font-semibold">Hints Used</h2>
            <Badge variant="secondary">{hintUsages.length}</Badge>
          </div>
          <HintTimeline hints={hintUsages} />
        </div>
      )}
    </div>
  );
}
