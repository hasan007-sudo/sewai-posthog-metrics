import type { PrismaClient } from "@/generated/prisma/client";
import type { HintRevealedProperties } from "@/types/posthog";

export async function handleHintRevealed(
  prisma: PrismaClient,
  studentId: string,
  properties: Record<string, unknown>,
  timestamp: string
): Promise<void> {
  const props = properties as unknown as HintRevealedProperties;

  const roomName = props.room_name;
  if (!roomName) {
    console.warn("[hint-revealed] Missing room_name, skipping");
    return;
  }

  const session = await prisma.session.findUnique({
    where: { roomName },
  });

  if (!session) {
    console.warn(
      `[hint-revealed] Session not found for roomName=${roomName}, skipping`
    );
    return;
  }

  // Find the latest HintUsage for this session + question that hasn't been revealed yet
  const hintUsage = await prisma.hintUsage.findFirst({
    where: {
      sessionId: session.id,
      questionId: props.question_id ?? null,
      revealedAt: null,
    },
    orderBy: { requestedAt: "desc" },
  });

  if (!hintUsage) {
    console.warn(
      `[hint-revealed] No pending HintUsage found for session=${session.id}, question=${props.question_id ?? "null"}, skipping`
    );
    return;
  }

  await prisma.hintUsage.update({
    where: { id: hintUsage.id },
    data: {
      hintText: props.hint_text ?? null,
      agentResponse: props.agent_response ?? null,
      cached: props.cached ?? false,
      revealedAt: new Date(timestamp),
    },
  });
}
