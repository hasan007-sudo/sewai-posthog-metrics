import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const search = searchParams.get("search")?.trim();

    const where = search
      ? {
          OR: [
            { email: { contains: search, mode: "insensitive" as const } },
            { name: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : undefined;

    const students = await prisma.student.findMany({
      where,
      include: {
        sessions: {
          select: {
            id: true,
            startedAt: true,
            status: true,
            _count: { select: { questionProgress: true, hintUsages: true } },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    type StudentRow = (typeof students)[number];
    type SessionRow = StudentRow["sessions"][number];

    const result = students
      .map((student: StudentRow) => {
        const sessionCount = student.sessions.length;
        const totalQuestionsCompleted = student.sessions.reduce(
          (sum: number, s: SessionRow) => sum + s._count.questionProgress,
          0
        );
        const avgQuestionsPerSession =
          sessionCount > 0 ? totalQuestionsCompleted / sessionCount : 0;

        const lastActiveDate =
          student.sessions.length > 0
            ? student.sessions.reduce(
                (latest: Date, s: SessionRow) =>
                  s.startedAt > latest ? s.startedAt : latest,
                student.sessions[0].startedAt
              )
            : student.createdAt;

        return {
          id: student.id,
          email: student.email,
          name: student.name,
          sessionCount,
          totalQuestionsCompleted,
          avgQuestionsPerSession:
            Math.round(avgQuestionsPerSession * 100) / 100,
          lastActiveDate,
          hintUsageCount: student.sessions.reduce(
            (sum: number, s: SessionRow) => sum + s._count.hintUsages,
            0
          ),
        };
      })
      .sort(
        (a: { lastActiveDate: Date }, b: { lastActiveDate: Date }) =>
          new Date(b.lastActiveDate).getTime() -
          new Date(a.lastActiveDate).getTime()
      );

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to fetch students:", error);
    return NextResponse.json(
      { error: "Failed to fetch students" },
      { status: 500 }
    );
  }
}
