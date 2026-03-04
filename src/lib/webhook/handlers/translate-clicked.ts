import type { PrismaClient } from "@/generated/prisma/client";

export async function handleTranslateClicked(
  prisma: PrismaClient,
  studentId: string,
  properties: Record<string, unknown>,
): Promise<void> {
  void prisma;
  void studentId;

  const roomName = properties.room_name;
  if (!roomName || typeof roomName !== "string") {
    console.warn("[translate-clicked] Missing room_name, skipping");
  }
}
