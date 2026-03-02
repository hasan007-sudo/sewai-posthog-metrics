import type { PrismaClient } from "@/generated/prisma/client";
import type { HintRequestedProperties } from "@/types/posthog";

export async function handleHintRequested(
  prisma: PrismaClient,
  studentId: string,
  properties: Record<string, unknown>,
  timestamp: string
): Promise<void> {
  const props = properties as unknown as HintRequestedProperties;

  const roomName = props.room_name;
  if (!roomName) {
    console.warn("[hint-requested] Missing room_name, skipping");
    return;
  }

  const session = await prisma.session.findUnique({
    where: { roomName },
  });

  if (!session) {
    console.warn(
      `[hint-requested] Session not found for roomName=${roomName}, skipping`
    );
    return;
  }

  await prisma.hintUsage.create({
    data: {
      sessionId: session.id,
      questionId: props.question_id ?? null,
      questionText: props.question_text ?? null,
      requestedAt: new Date(timestamp),
    },
  });
}
