import type { PrismaClient } from "@/generated/prisma/client";
import type { QuestionCompletedProperties } from "@/types/posthog";

export async function handleQuestionCompleted(
  prisma: PrismaClient,
  studentId: string,
  properties: Record<string, unknown>,
  timestamp: string
): Promise<void> {
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
