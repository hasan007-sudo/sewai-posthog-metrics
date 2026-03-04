import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { fetchSewaiActivityMetadata } from "@/lib/sewai-prisma";

export interface SessionMetricsRow {
  translated_clicks_events: number;
  total_questions_of_session: number;
  duration_of_session_ms: number | null;
  topic_name: string;
  activity_name: string;
  hint_count: number;
  questions_completed: number;
  student_email: string;
  student_name: string;
  student_session_id: string;
  org_name: string;
}

interface SessionMetricsDbRow {
  translated_clicks_events: number;
  total_questions_of_session: number;
  duration_of_session_ms: number | null;
  activity_name: string;
  hint_count: number;
  questions_completed: number;
  student_email: string;
  student_name: string;
  student_session_id: string;
  org_name: string;
  activity_external_id: string;
}

export async function GET() {
  try {
    const baseRows = await prisma.$queryRaw<SessionMetricsDbRow[]>(Prisma.sql`
      WITH question_counts AS (
        SELECT
          qp."sessionId" AS session_id,
          COUNT(*)::int AS questions_completed
        FROM "QuestionProgress" qp
        GROUP BY qp."sessionId"
      ),
      hint_counts AS (
        SELECT
          hu."sessionId" AS session_id,
          COUNT(*)::int AS hint_count
        FROM "HintUsage" hu
        GROUP BY hu."sessionId"
      )
      SELECT
        COALESCE(s."translatedClicksEvents", 0)::int AS translated_clicks_events,
        COALESCE(a."questionCount", 0)::int AS total_questions_of_session,
        COALESCE(
          s."durationMs",
          CASE
            WHEN s."endedAt" IS NOT NULL THEN
              (EXTRACT(EPOCH FROM (s."endedAt" - s."startedAt")) * 1000)::int
            ELSE NULL
          END
        )::int AS duration_of_session_ms,
        COALESCE(a.title, 'Unknown Activity') AS activity_name,
        COALESCE(hc.hint_count, 0)::int AS hint_count,
        COALESCE(qc.questions_completed, 0)::int AS questions_completed,
        st.email AS student_email,
        st.email AS student_name,
        s."roomName" AS student_session_id,
        COALESCE(NULLIF(s."orgName", ''), 'unknown') AS org_name,
        COALESCE(a."externalId", '') AS activity_external_id
      FROM "Session" s
      INNER JOIN "Student" st
        ON st.id = s."studentId"
      LEFT JOIN "Activity" a
        ON a.id = s."activityId"
      LEFT JOIN question_counts qc
        ON qc.session_id = s.id
      LEFT JOIN hint_counts hc
        ON hc.session_id = s.id
      ORDER BY s."startedAt" DESC
    `);

    const activityIds = Array.from(
      new Set(
        baseRows
          .map((row) => row.activity_external_id)
          .filter((activityId) => activityId.length > 0),
      ),
    );

    const sewaiActivityMetadata =
      await fetchSewaiActivityMetadata(activityIds);

    const rows: SessionMetricsRow[] = baseRows.map(
      ({ activity_external_id, ...row }) => {
        const metadata = sewaiActivityMetadata.get(activity_external_id);
        return {
          ...row,
          topic_name: metadata?.topicName ?? "-",
          activity_name: row.activity_name,
        };
      },
    );

    return NextResponse.json({
      totalSessions: rows.length,
      rows,
    });
  } catch (error) {
    console.error("Failed to fetch session metrics:", error);
    return NextResponse.json(
      { error: "Failed to fetch session metrics" },
      { status: 500 },
    );
  }
}
