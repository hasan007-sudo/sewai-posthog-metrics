import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { EVENT_HANDLERS } from "@/lib/webhook/processor";
import { syncSessionDerivedMetrics } from "@/lib/webhook/session-derived-metrics";

export async function POST() {
  // // 2. Delete all domain data (order matters for FK constraints)
  // await prisma.questionProgress.deleteMany();
  // await prisma.hintUsage.deleteMany();
  // await prisma.nextActivityClick.deleteMany();
  // await prisma.session.deleteMany();
  // await prisma.activity.deleteMany();
  // await prisma.student.deleteMany();

  // // 3. Mark all raw events as unprocessed
  // await prisma.rawEvent.updateMany({
  //   data: { processed: false, processedAt: null, sessionId: null },
  // });

  // // 3. Replay all events in chronological order
  // const allEvents = await prisma.rawEvent.findMany({
  //   orderBy: { timestamp: "asc" },
  // });

  // let succeeded = 0;
  // let failed = 0;
  // const errors: { id: string; eventType: string; error: string }[] = [];

  // for (const raw of allEvents) {
  //   try {
  //     const handler = EVENT_HANDLERS[raw.eventType];
  //     if (!handler) {
  //       await prisma.rawEvent.update({
  //         where: { id: raw.id },
  //         data: { processed: true, processedAt: new Date() },
  //       });
  //       succeeded++;
  //       continue;
  //     }

  //     const properties = raw.properties as Record<string, unknown>;
  //     const studentName = (properties.student_name as string | undefined) ?? null;
  //     const student = await prisma.student.upsert({
  //       where: { email: raw.distinctId },
  //       update: { ...(studentName ? { name: studentName } : {}) },
  //       create: { email: raw.distinctId, name: studentName },
  //     });

  //     await handler(prisma, student.id, properties, raw.timestamp.toISOString());

  //     const roomName = properties.room_name as string | undefined;
  //     if (roomName) {
  //       const sessionId = await syncSessionDerivedMetrics(prisma, {
  //         roomName,
  //         eventType: raw.eventType,
  //         properties,
  //       });
  //       if (sessionId) {
  //         await prisma.rawEvent.update({
  //           where: { id: raw.id },
  //           data: { sessionId },
  //         });
  //       }
  //     }

  //     await prisma.rawEvent.update({
  //       where: { id: raw.id },
  //       data: { processed: true, processedAt: new Date() },
  //     });
  //     succeeded++;
  //   } catch (error) {
  //     failed++;
  //     errors.push({
  //       id: raw.id,
  //       eventType: raw.eventType,
  //       error: error instanceof Error ? error.message : String(error),
  //     });
  //   }
  // }

  return NextResponse.json({
    // total: allEvents.length,
    // succeeded,
    // failed,
    // errors: errors.slice(0, 50),
  });
}
