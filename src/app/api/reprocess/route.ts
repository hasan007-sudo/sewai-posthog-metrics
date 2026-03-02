import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { EVENT_HANDLERS } from "@/lib/webhook/processor";

export async function POST() {
  const unprocessed = await prisma.rawEvent.findMany({
    where: { processed: false },
    orderBy: { timestamp: "asc" },
  });

  if (unprocessed.length === 0) {
    return NextResponse.json({ message: "No unprocessed events", total: 0 });
  }

  let succeeded = 0;
  let failed = 0;
  const errors: { id: string; eventType: string; error: string }[] = [];

  for (const raw of unprocessed) {
    try {
      const handler = EVENT_HANDLERS[raw.eventType];
      if (!handler) {
        // No handler — mark as processed to avoid retrying
        await prisma.rawEvent.update({
          where: { id: raw.id },
          data: { processed: true, processedAt: new Date() },
        });
        succeeded++;
        continue;
      }

      // Upsert student from distinctId (email)
      const properties = raw.properties as Record<string, unknown>;
      const studentName = (properties.student_name as string | undefined) ?? null;
      const student = await prisma.student.upsert({
        where: { email: raw.distinctId },
        update: { ...(studentName ? { name: studentName } : {}) },
        create: { email: raw.distinctId, name: studentName },
      });

      await handler(prisma, student.id, properties, raw.timestamp.toISOString());

      // Link to session if room_name present
      const roomName = properties.room_name as string | undefined;
      if (roomName && !raw.sessionId) {
        const session = await prisma.session.findUnique({
          where: { roomName },
          select: { id: true },
        });
        if (session) {
          await prisma.rawEvent.update({
            where: { id: raw.id },
            data: { sessionId: session.id },
          });
        }
      }

      await prisma.rawEvent.update({
        where: { id: raw.id },
        data: { processed: true, processedAt: new Date() },
      });
      succeeded++;
    } catch (error) {
      failed++;
      errors.push({
        id: raw.id,
        eventType: raw.eventType,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return NextResponse.json({
    total: unprocessed.length,
    succeeded,
    failed,
    errors: errors.slice(0, 20),
  });
}
