import type { PrismaClient } from "@/generated/prisma/client";
import type { HintFollowedByResponseProperties } from "@/types/posthog";

export async function handleHintResponse(
  prisma: PrismaClient,
  studentId: string,
  properties: Record<string, unknown>,
  timestamp: string
): Promise<void> {
  const props = properties as unknown as HintFollowedByResponseProperties;

  const roomName = props.room_name;
  if (!roomName) {
    console.warn("[hint-response] Missing room_name, skipping");
    return;
  }

  const session = await prisma.session.findUnique({
    where: { roomName },
  });

  if (!session) {
    console.warn(
      `[hint-response] Session not found for roomName=${roomName}, skipping`
    );
    return;
  }

  // Find the latest HintUsage for this session + question that has been revealed but not yet responded to
  const hintUsage = await prisma.hintUsage.findFirst({
    where: {
      sessionId: session.id,
      questionId: props.question_id ?? null,
      respondedAt: null,
    },
    orderBy: { requestedAt: "desc" },
  });

  if (!hintUsage) {
    console.warn(
      `[hint-response] No pending HintUsage found for session=${session.id}, question=${props.question_id ?? "null"}, skipping`
    );
    return;
  }

  await prisma.hintUsage.update({
    where: { id: hintUsage.id },
    data: {
      userResponse: props.user_response ?? null,
      respondedAt: new Date(timestamp),
    },
  });
}
