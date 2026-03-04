import type { PrismaClient } from "@/generated/prisma/client";
import type { SessionStartedProperties } from "@/types/posthog";
import { fetchSewaiActivityMetadata } from "@/lib/sewai-prisma";

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

  let validQuestionCount = toPositiveInteger(props.question_count);

  // SEWAI currently sends activity name but question_count can be 0 on session start.
  // Fall back to SEWAI activity config so we still persist questionCount in Activity.
  if (validQuestionCount === null) {
    const sewaiMetadata = await fetchSewaiActivityMetadata([activityExternalId]);
    const configuredQuestionCount =
      sewaiMetadata.get(activityExternalId)?.configuredQuestionCount ?? 0;
    validQuestionCount = configuredQuestionCount > 0 ? configuredQuestionCount : null;
  }

  // Upsert the activity
  const activity = await prisma.activity.upsert({
    where: { externalId: activityExternalId },
    update: {
      title: props.activity_title ?? "",
    },
    create: {
      externalId: activityExternalId,
      title: props.activity_title ?? "",
      questionCount: validQuestionCount ?? 0,
    },
  });

  if (validQuestionCount !== null) {
    await prisma.activity.updateMany({
      where: {
        id: activity.id,
        questionCount: { lt: validQuestionCount },
      },
      data: {
        questionCount: validQuestionCount,
      },
    });
  }

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
