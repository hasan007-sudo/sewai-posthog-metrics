import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { processWebhookEvent } from "@/lib/webhook/processor";
import type { PostHogWebhookPayload } from "@/types/posthog";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // PostHog can send a single event or an array of events
    const events: PostHogWebhookPayload[] = Array.isArray(body)
      ? body
      : [body];

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
