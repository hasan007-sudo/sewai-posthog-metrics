import type { PrismaClient } from "@/generated/prisma/client";
import type { SessionEndedProperties } from "@/types/posthog";

export async function handleSessionEnded(
  prisma: PrismaClient,
  studentId: string,
  properties: Record<string, unknown>,
  timestamp: string,
  endReason?: string,
): Promise<void> {
  const props = properties as unknown as SessionEndedProperties;

  const roomName = props.room_name;
  if (!roomName) {
    console.warn("[session-ended] Missing room_name, skipping");
    return;
  }

  const session = await prisma.session.findUnique({
    where: { roomName },
  });

  if (!session) {
    console.warn(
      `[session-ended] Session not found for roomName=${roomName}, skipping`
    );
    return;
  }

  const endedAt = new Date(timestamp);
  const durationMs =
    props.duration_ms ?? endedAt.getTime() - session.startedAt.getTime();

  const updateData: {
    status: "ENDED";
    endedAt: Date;
    durationMs: number;
    endReason?: string;
  } = {
    status: "ENDED",
    endedAt,
    durationMs: Math.round(durationMs),
  };

  if (endReason && !session.endReason) {
    updateData.endReason = endReason;
  }

  await prisma.session.update({
    where: { roomName },
    data: updateData,
  });
}
