import type { PrismaClient } from "@/generated/prisma/client";
import { Prisma } from "@/generated/prisma/client";

function extractPathFromValue(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  if (trimmed.startsWith("/")) {
    return trimmed;
  }

  try {
    return new URL(trimmed).pathname;
  } catch {
    return null;
  }
}

export function extractOrgSlugFromProperties(
  properties: Record<string, unknown>,
): string | null {
  const directSlug = properties.slug;
  if (typeof directSlug === "string" && directSlug.trim().length > 0) {
    return directSlug.trim();
  }

  const pathCandidateKeys = [
    "$pathname",
    "$current_url",
    "pathname",
    "current_url",
    "url",
  ];

  for (const key of pathCandidateKeys) {
    const path = extractPathFromValue(properties[key]);
    if (!path) {
      continue;
    }

    const orgFromPath = path.match(/\/org\/([^/?#]+)/i)?.[1];
    if (orgFromPath) {
      return decodeURIComponent(orgFromPath);
    }
  }

  return null;
}

interface SyncSessionDerivedMetricsInput {
  roomName: string;
  eventType: string;
  properties: Record<string, unknown>;
}

export async function syncSessionDerivedMetrics(
  prisma: PrismaClient,
  input: SyncSessionDerivedMetricsInput,
): Promise<string | null> {
  const { roomName, eventType, properties } = input;

  const session = await prisma.session.findUnique({
    where: { roomName },
    select: { id: true },
  });

  if (!session) {
    return null;
  }

  const orgSlug = extractOrgSlugFromProperties(properties);
  const shouldIncrementTranslatedClicks = eventType === "monologue_translate_clicked";

  const updateData: Prisma.SessionUpdateInput = {};
  if (orgSlug) {
    updateData.orgName = orgSlug;
  }
  if (shouldIncrementTranslatedClicks) {
    updateData.translatedClicksEvents = { increment: 1 };
  }

  if (Object.keys(updateData).length > 0) {
    await prisma.session.update({
      where: { id: session.id },
      data: updateData,
    });
  }

  return session.id;
}
