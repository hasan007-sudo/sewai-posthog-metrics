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
      totalQuestionsCompleted,
      totalNextActivityClicks,
      totalHintUsages,
      recentSessions,
    ] = await Promise.all([
      prisma.student.count(),
      prisma.session.count(),
      prisma.session.count({ where: { status: "STARTED" } }),
      prisma.session.count({ where: { status: "ENDED" } }),
      prisma.session.count({ where: { status: "ABANDONED" } }),
      prisma.questionProgress.count(),
      prisma.nextActivityClick.count(),
      prisma.hintUsage.count(),
      prisma.session.findMany({
        take: 10,
        orderBy: { startedAt: "desc" },
        include: {
          student: { select: { id: true, email: true, name: true } },
          activity: { select: { id: true, title: true, externalId: true } },
          _count: { select: { questionProgress: true } },
        },
      }),
    ]);

    const endedWithQuestions = await prisma.session.findMany({
      where: {
        status: "ENDED",
        activity: { questionCount: { gt: 0 } },
      },
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

    return NextResponse.json({
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
