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
              select: { id: true, title: true, externalId: true },
            },
          },
        },
        hintUsages: {
          select: {
            id: true,
            questionId: true,
            questionText: true,
            hintText: true,
            agentResponse: true,
            userResponse: true,
            requestedAt: true,
            revealedAt: true,
            respondedAt: true,
            session: {
              select: { roomName: true },
            },
            activity: {
              select: { id: true, title: true },
            },
          },
          orderBy: { requestedAt: "desc" },
        },
      },
    });

    if (!student) {
      return NextResponse.json(
        { error: "Student not found" },
        { status: 404 }
      );
    }

    type SessionRow = (typeof student.sessions)[number];

    // Compute totals
    const totalSessions = student.sessions.length;
    const totalQuestions = student.sessions.reduce(
      (sum: number, s: SessionRow) => sum + s.completedCount,
      0
    );

    const endedWithQuestions = student.sessions.filter(
      (s: SessionRow) => s.status === "ENDED" && s.questionCount > 0
    );
    const avgCompletionRate =
      endedWithQuestions.length > 0
        ? endedWithQuestions.reduce(
            (sum: number, s: SessionRow) =>
              sum + s.completedCount / s.questionCount,
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
      questionCount: s.questionCount,
      completedCount: s.completedCount,
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
      hintUsages: student.hintUsages,
    });
  } catch (error) {
    console.error("Failed to fetch student detail:", error);
    return NextResponse.json(
      { error: "Failed to fetch student detail" },
      { status: 500 }
    );
  }
}
