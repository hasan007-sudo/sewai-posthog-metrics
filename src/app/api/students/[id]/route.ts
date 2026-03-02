import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const student = await prisma.student.findUnique({
      where: { id },
      include: {
        sessions: {
          orderBy: { startedAt: "desc" },
          include: {
            activity: {
              select: { id: true, title: true, externalId: true, questionCount: true },
            },
            _count: { select: { questionProgress: true } },
          },
        },
      },
    });

    if (!student) {
      return NextResponse.json(
        { error: "Student not found" },
        { status: 404 }
      );
    }

    // Fetch hint usages through sessions (no direct Student.hintUsages relation)
    const hintUsages = await prisma.hintUsage.findMany({
      where: { session: { studentId: id } },
      orderBy: { requestedAt: "desc" },
      include: {
        session: { select: { roomName: true } },
      },
    });

    type SessionRow = (typeof student.sessions)[number];

    // Compute totals
    const totalSessions = student.sessions.length;
    const totalQuestions = student.sessions.reduce(
      (sum: number, s: SessionRow) => sum + s._count.questionProgress,
      0
    );

    const endedWithQuestions = student.sessions.filter(
      (s: SessionRow) =>
        s.status === "ENDED" && (s.activity?.questionCount ?? 0) > 0
    );
    const avgCompletionRate =
      endedWithQuestions.length > 0
        ? endedWithQuestions.reduce(
            (sum: number, s: SessionRow) =>
              sum +
              s._count.questionProgress / (s.activity?.questionCount ?? 1),
            0
          ) / endedWithQuestions.length
        : 0;

    const sessions = student.sessions.map((s: SessionRow) => ({
      id: s.id,
      roomName: s.roomName,
      activity: s.activity,
      status: s.status,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      questionCount: s.activity?.questionCount ?? 0,
      completedCount: s._count.questionProgress,
      durationMs: s.durationMs,
    }));

    return NextResponse.json({
      student: {
        id: student.id,
        email: student.email,
        name: student.name,
        createdAt: student.createdAt,
      },
      sessions,
      totals: {
        totalSessions,
        totalQuestions,
        avgCompletionRate: Math.round(avgCompletionRate * 10000) / 100,
      },
      hintUsages,
    });
  } catch (error) {
    console.error("Failed to fetch student detail:", error);
    return NextResponse.json(
      { error: "Failed to fetch student detail" },
      { status: 500 }
    );
  }
}
