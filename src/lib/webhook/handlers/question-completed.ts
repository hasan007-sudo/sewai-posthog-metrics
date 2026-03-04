import type { PrismaClient } from "@/generated/prisma/client";
import type { QuestionCompletedProperties } from "@/types/posthog";

function toPositiveInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = Math.trunc(value);
    return parsed > 0 ? parsed : null;
  }

  if (typeof value === "string" && /^[0-9]+$/.test(value)) {
    const parsed = Number.parseInt(value, 10);
    return parsed > 0 ? parsed : null;
  }

  return null;
}

export async function handleQuestionCompleted(
  prisma: PrismaClient,
  studentId: string,
  properties: Record<string, unknown>,
  timestamp: string
): Promise<void> {
  void studentId;
  const props = properties as unknown as QuestionCompletedProperties;

  const roomName = props.room_name;
  if (!roomName) {
    console.warn("[question-completed] Missing room_name, skipping");
    return;
  }

  const session = await prisma.session.findUnique({
    where: { roomName },
  });

  if (!session) {
    console.warn(
      `[question-completed] Session not found for roomName=${roomName}, skipping`
    );
    return;
  }

  const questionId = props.question_id;
  if (!questionId) {
    console.warn("[question-completed] Missing question_id, skipping");
    return;
  }

  // Canonical source for total questions after session starts:
  // question_completed.total_count from SEWAI events.
  const totalCount = toPositiveInteger(props.total_count);
  if (session.activityId && totalCount !== null) {
    await prisma.activity.updateMany({
      where: {
        id: session.activityId,
        questionCount: { lt: totalCount },
      },
      data: {
        questionCount: totalCount,
      },
    });
  }

  // Upsert to handle duplicate events for the same question
  await prisma.questionProgress.upsert({
    where: {
      sessionId_questionId: {
        sessionId: session.id,
        questionId,
      },
    },
    update: {
      attemptNumber: props.attempt_number ?? 1,
      questionText: props.question_text ?? null,
      completedAt: new Date(timestamp),
    },
    create: {
      sessionId: session.id,
      questionId,
      questionText: props.question_text ?? null,
      completedAt: new Date(timestamp),
      attemptNumber: props.attempt_number ?? 1,
    },
  });
}
