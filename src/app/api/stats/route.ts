import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const [
      totalStudents,
      totalSessions,
      startedCount,
      endedCount,
      abandonedCount,
      questionsAgg,
      endedSessionsAgg,
      totalNextActivityClicks,
      totalHintUsages,
      recentSessions,
    ] = await Promise.all([
      // Total students
      prisma.student.count(),

      // Total sessions
      prisma.session.count(),

      // Sessions by status
      prisma.session.count({ where: { status: "STARTED" } }),
      prisma.session.count({ where: { status: "ENDED" } }),
      prisma.session.count({ where: { status: "ABANDONED" } }),

      // Total questions completed (sum of all completedCount)
      prisma.session.aggregate({
        _sum: { completedCount: true },
      }),

      // Avg questions per session and avg completion rate for ENDED sessions
      prisma.session.aggregate({
        where: { status: "ENDED" },
        _avg: { completedCount: true },
      }),

      // Total next activity clicks
      prisma.nextActivityClick.count(),

      // Total hint usages
      prisma.hintUsage.count(),

      // Recent activity: last 10 sessions with student and activity info
      prisma.session.findMany({
        take: 10,
        orderBy: { startedAt: "desc" },
        include: {
          student: { select: { id: true, email: true, name: true } },
          activity: { select: { id: true, title: true, externalId: true } },
        },
      }),
    ]);

    // Compute average completion rate for ENDED sessions with questionCount > 0
    const endedWithQuestions = await prisma.session.findMany({
      where: {
        status: "ENDED",
        questionCount: { gt: 0 },
      },
      select: {
        completedCount: true,
        questionCount: true,
      },
    });

    const avgCompletionRate =
      endedWithQuestions.length > 0
        ? endedWithQuestions.reduce(
            (sum: number, s: { completedCount: number; questionCount: number }) =>
              sum + s.completedCount / s.questionCount,
            0
          ) / endedWithQuestions.length
        : 0;

    return NextResponse.json({
      totalStudents,
      totalSessions,
      sessionsByStatus: {
        STARTED: startedCount,
        ENDED: endedCount,
        ABANDONED: abandonedCount,
      },
      totalQuestionsCompleted: questionsAgg._sum.completedCount ?? 0,
      avgQuestionsPerSession: endedSessionsAgg._avg.completedCount ?? 0,
      avgCompletionRate: Math.round(avgCompletionRate * 10000) / 100, // percentage with 2 decimals
      totalNextActivityClicks,
      totalHintUsages,
      recentActivity: recentSessions,
    });
  } catch (error) {
    console.error("Failed to fetch stats:", error);
    return NextResponse.json(
      { error: "Failed to fetch dashboard stats" },
      { status: 500 }
    );
  }
}
