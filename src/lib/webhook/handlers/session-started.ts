import type { PrismaClient } from "@/generated/prisma/client";
import type { SessionStartedProperties } from "@/types/posthog";

export async function handleSessionStarted(
  prisma: PrismaClient,
  studentId: string,
  properties: Record<string, unknown>,
  timestamp: string
): Promise<void> {
  const props = properties as unknown as SessionStartedProperties;

  const roomName = props.room_name;
  if (!roomName) {
    console.warn("[session-started] Missing room_name, skipping");
    return;
  }

  const activityExternalId = props.activity_id;
  if (!activityExternalId) {
    console.warn("[session-started] Missing activity_id, skipping");
    return;
  }

  // Upsert the activity
  const activity = await prisma.activity.upsert({
    where: { externalId: activityExternalId },
    update: {
      title: props.activity_title ?? "",
      questionCount: props.question_count ?? 0,
    },
    create: {
      externalId: activityExternalId,
      title: props.activity_title ?? "",
      questionCount: props.question_count ?? 0,
    },
  });

  // Create session (upsert by roomName to be idempotent)
  await prisma.session.upsert({
    where: { roomName },
    update: {},
    create: {
      roomName,
      studentId,
      activityId: activity.id,
      status: "STARTED",
      startedAt: new Date(timestamp),
    },
  });
}
