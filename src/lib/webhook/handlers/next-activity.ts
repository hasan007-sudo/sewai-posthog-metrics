import type { PrismaClient } from "@/generated/prisma/client";
import type { NextActivityProperties } from "@/types/posthog";

export async function handleNextActivity(
  prisma: PrismaClient,
  studentId: string,
  properties: Record<string, unknown>,
  timestamp: string
): Promise<void> {
  const props = properties as unknown as NextActivityProperties;

  await prisma.nextActivityClick.create({
    data: {
      studentId,
      fromActivityId: props.from_activity_id ?? null,
      toActivityId: props.to_activity_id ?? null,
      toActivityTitle: props.to_activity_title ?? null,
      clickedAt: new Date(timestamp),
    },
  });
}
