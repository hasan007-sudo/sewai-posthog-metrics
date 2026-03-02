import { prisma } from "@/lib/prisma";
import { StatsCards } from "@/components/dashboard/StatsCards";
import { StudentTable } from "@/components/dashboard/StudentTable";

export const dynamic = "force-dynamic";

async function getStats() {
  const [
    totalStudents,
    totalSessions,
    startedCount,
    endedCount,
    abandonedCount,
    totalQuestionsCompleted,
    totalNextActivityClicks,
    totalHintUsages,
  ] = await Promise.all([
    prisma.student.count(),
    prisma.session.count(),
    prisma.session.count({ where: { status: "STARTED" } }),
    prisma.session.count({ where: { status: "ENDED" } }),
    prisma.session.count({ where: { status: "ABANDONED" } }),
    prisma.questionProgress.count(),
    prisma.nextActivityClick.count(),
    prisma.hintUsage.count(),
  ]);

  const endedWithQuestions = await prisma.session.findMany({
    where: { status: "ENDED", activity: { questionCount: { gt: 0 } } },
    select: {
      activity: { select: { questionCount: true } },
      _count: { select: { questionProgress: true } },
    },
  });

  const avgCompletionRate =
    endedWithQuestions.length > 0
      ? endedWithQuestions.reduce(
          (sum, s) =>
            sum + s._count.questionProgress / s.activity!.questionCount,
          0
        ) / endedWithQuestions.length
      : 0;

  const avgQuestionsPerSession =
    endedCount > 0 ? totalQuestionsCompleted / endedCount : 0;

  return {
    totalStudents,
    totalSessions,
    sessionsByStatus: {
      STARTED: startedCount,
      ENDED: endedCount,
      ABANDONED: abandonedCount,
    },
    totalQuestionsCompleted,
    avgQuestionsPerSession: Math.round(avgQuestionsPerSession * 100) / 100,
    avgCompletionRate: Math.round(avgCompletionRate * 10000) / 100,
    totalNextActivityClicks,
    totalHintUsages,
  };
}

async function getStudents() {
  const students = await prisma.student.findMany({
    include: {
      sessions: {
        select: {
          startedAt: true,
          _count: { select: { questionProgress: true, hintUsages: true } },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  return students.map((student) => {
    const sessionCount = student.sessions.length;
    const totalQuestionsCompleted = student.sessions.reduce(
      (sum, s) => sum + s._count.questionProgress,
      0
    );
    const avgQuestionsPerSession =
      sessionCount > 0 ? totalQuestionsCompleted / sessionCount : 0;
    const lastActiveDate =
      student.sessions.length > 0
        ? student.sessions.reduce(
            (latest, s) => (s.startedAt > latest ? s.startedAt : latest),
            student.sessions[0].startedAt
          )
        : student.createdAt;
    const hintUsageCount = student.sessions.reduce(
      (sum, s) => sum + s._count.hintUsages,
      0
    );

    return {
      id: student.id,
      email: student.email,
      name: student.name,
      sessionCount,
      totalQuestionsCompleted,
      avgQuestionsPerSession: Math.round(avgQuestionsPerSession * 100) / 100,
      lastActiveDate: lastActiveDate.toISOString(),
      hintUsageCount,
    };
  });
}

export default async function MonologueDashboardPage() {
  const [stats, students] = await Promise.all([getStats(), getStudents()]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Monologue v2</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Monologue learning analytics overview
        </p>
      </div>

      <StatsCards stats={stats} />

      <div>
        <h2 className="text-lg font-semibold mb-4">Students</h2>
        <StudentTable students={students} />
      </div>
    </div>
  );
}
