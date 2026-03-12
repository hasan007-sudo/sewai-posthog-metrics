import type { PrismaClient } from "@/generated/prisma/client";
import type { PostHogWebhookPayload } from "@/types/posthog";

import { handleSessionStarted } from "./handlers/session-started";
import { handleSessionEnded } from "./handlers/session-ended";
import { handleQuestionCompleted } from "./handlers/question-completed";
import { handleNextActivity } from "./handlers/next-activity";
import { handleHintRequested } from "./handlers/hint-requested";
import { handleHintRevealed } from "./handlers/hint-revealed";
import { handleHintResponse } from "./handlers/hint-response";
import { handleTranslateClicked } from "./handlers/translate-clicked";
import { syncSessionDerivedMetrics } from "./session-derived-metrics";

type EventHandler = (
  prisma: PrismaClient,
  studentId: string,
  properties: Record<string, unknown>,
  timestamp: string,
) => Promise<void>;

export const EVENT_HANDLERS: Record<string, EventHandler> = {
  monologue_session_started: handleSessionStarted,
  monologue_session_end_clicked: handleSessionEnded,
  monologue_session_ended: (prisma, studentId, properties, timestamp) =>
    handleSessionEnded(
      prisma,
      studentId,
      properties,
      timestamp,
      "server_ended",
    ),
  monologue_question_completed: handleQuestionCompleted,
  monologue_translate_clicked: handleTranslateClicked,
  next_activity_clicked: handleNextActivity,
  hint_requested: handleHintRequested,
  hint_revealed: handleHintRevealed,
  hint_followed_by_response: handleHintResponse,
};

export async function processWebhookEvent(
  prisma: PrismaClient,
  payload: PostHogWebhookPayload,
): Promise<void> {
  const { event, distinct_id, properties, timestamp } = payload;

  // Validate required fields
  if (!event || !distinct_id) {
    console.error("[processor] Invalid payload structure:", {
      hasEvent: !!event,
      hasDistinctId: !!distinct_id,
      payload,
    });
    throw new Error(
      `Missing required fields: ${!event ? "event" : ""} ${!distinct_id ? "distinct_id" : ""}`,
    );
  }

  const eventTimestamp = timestamp ?? new Date().toISOString();

  // 1. Store raw event
  const rawEvent = await prisma.rawEvent.create({
    data: {
      eventType: event,
      distinctId: distinct_id,
      properties: (properties ?? {}) as object,
      timestamp: new Date(eventTimestamp),
      processed: false,
    },
  });

  try {
    // 2. Upsert student by email (distinct_id is the student email)
    const studentName = (properties.student_name as string | undefined) ?? null;

    const student = await prisma.student.upsert({
      where: { email: distinct_id },
      update: {
        ...(studentName ? { name: studentName } : {}),
      },
      create: {
        email: distinct_id,
        name: studentName,
      },
    });
    console.log(`Received posthog event: ${event}`);

    // 3. Route to specific handler
    const handler = EVENT_HANDLERS[event];

    if (handler) {
      await handler(prisma, student.id, properties, eventTimestamp);
    } else {
      console.warn(`[processor] No handler for event type: ${event}`);
    }

    // 4. Link raw event to session if room_name is present
    const roomName = properties.room_name as string | undefined;
    if (roomName) {
      const sessionId = await syncSessionDerivedMetrics(prisma, {
        roomName,
        eventType: event,
        properties,
        eventTimestamp,
      });

      if (sessionId) {
        await prisma.rawEvent.update({
          where: { id: rawEvent.id },
          data: { sessionId },
        });
      }
    }

    // 5. Mark raw event as processed
    await prisma.rawEvent.update({
      where: { id: rawEvent.id },
      data: {
        processed: true,
        processedAt: new Date(),
      },
    });
  } catch (error) {
    console.error(
      `[processor] Error processing event ${event} (rawEvent=${rawEvent.id}):`,
      error,
    );

    // Leave raw event as unprocessed so it can be retried or inspected
    throw error;
  }
}
