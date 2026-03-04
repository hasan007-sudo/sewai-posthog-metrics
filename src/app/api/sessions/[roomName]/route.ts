import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ roomName: string }> }
) {
  try {
    const { roomName } = await params;

    const session = await prisma.session.findUnique({
      where: { roomName },
      include: {
        student: {
          select: { id: true, email: true, name: true },
        },
        activity: {
          select: {
            id: true,
            externalId: true,
            title: true,
            questionCount: true,
          },
        },
        _count: { select: { questionProgress: true } },
        questionProgress: {
          orderBy: { completedAt: "asc" },
          select: {
            id: true,
            questionId: true,
            questionText: true,
            completedAt: true,
            attemptNumber: true,
          },
        },
        hintUsages: {
          orderBy: { requestedAt: "asc" },
          select: {
            id: true,
            questionId: true,
            questionText: true,
            hintText: true,
            agentResponse: true,
            userResponse: true,
            cached: true,
            requestedAt: true,
            revealedAt: true,
            respondedAt: true,
          },
        },
      },
    });

    if (!session) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    // Derived completion metrics
    const completedCount = session._count.questionProgress;
    const questionCount = session.activity?.questionCount ?? 0;

    // Computed stats
    const durationMs = session.durationMs ?? (
      session.endedAt
        ? new Date(session.endedAt).getTime() -
          new Date(session.startedAt).getTime()
        : null
    );

    const completionPercentage =
      questionCount > 0
        ? Math.round(
            (completedCount / questionCount) * 10000
          ) / 100
        : 0;

    return NextResponse.json({
      session: {
        id: session.id,
        roomName: session.roomName,
        status: session.status,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        questionCount,
        completedCount,
        durationMs,
        translatedClicksEvents: session.translatedClicksEvents,
        orgName: session.orgName,
      },
      student: session.student,
      activity: session.activity,
      questionProgress: session.questionProgress,
      hintUsages: session.hintUsages,
      computed: {
        durationMs,
        completionPercentage,
      },
    });
  } catch (error) {
    console.error("Failed to fetch session detail:", error);
    return NextResponse.json(
      { error: "Failed to fetch session detail" },
      { status: 500 }
    );
  }
}
