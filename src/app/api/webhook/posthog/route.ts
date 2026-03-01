import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { processWebhookEvent } from "@/lib/webhook/processor";
import type { PostHogWebhookPayload, PostHogWebhookWrapper } from "@/types/posthog";

function normalizePostHogPayload(
  wrapper: PostHogWebhookWrapper
): PostHogWebhookPayload {
  return {
    event: wrapper.event.event,
    distinct_id: wrapper.event.distinct_id,
    properties: wrapper.event.properties,
    timestamp: wrapper.event.timestamp,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Log event count for monitoring
    console.log("[webhook/posthog] Received webhook request");

    // PostHog wraps events in { event: {...}, person: {...} } structure
    // Normalize to internal format
    let events: PostHogWebhookPayload[];

    if (Array.isArray(body)) {
      // Array of wrapped events
      events = body.map(normalizePostHogPayload);
    } else if (body.event && typeof body.event === "object") {
      // Single wrapped event
      events = [normalizePostHogPayload(body as PostHogWebhookWrapper)];
    } else {
      // Fallback: assume direct format (for backwards compatibility)
      events = [body as PostHogWebhookPayload];
    }

    const results = await Promise.allSettled(
      events.map((event) => processWebhookEvent(prisma, event))
    );

    const failed = results.filter((r) => r.status === "rejected");

    if (failed.length > 0) {
      console.error(
        `[webhook/posthog] ${failed.length}/${events.length} events failed to process`
      );
      for (const f of failed) {
        console.error(
          "[webhook/posthog] Failure reason:",
          (f as PromiseRejectedResult).reason
        );
      }
    }

    // Always return 200 to prevent PostHog from retrying.
    // Failed events remain unprocessed in the RawEvent table for manual inspection.
    return NextResponse.json({
      success: true,
      processed: events.length - failed.length,
      failed: failed.length,
      total: events.length,
    });
  } catch (error) {
    console.error("[webhook/posthog] Fatal error:", error);

    // Still return 200 to avoid PostHog retry loops
    return NextResponse.json(
      { success: false, error: "Internal processing error" },
      { status: 200 }
    );
  }
}
