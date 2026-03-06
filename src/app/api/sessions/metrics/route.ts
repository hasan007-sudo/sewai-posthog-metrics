import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { fetchSewaiActivityMetadata } from "@/lib/sewai-prisma";
import { buildCompletionBands } from "@/lib/completion-bands";

export interface SessionMetricsRow {
  status: string;
  translated_clicks_events: number;
  total_questions_of_session: number;
  duration_of_session_ms: number | null;
  started_at: string;
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
  status: string;
  translated_clicks_events: number;
  total_questions_of_session: number;
  duration_of_session_ms: number | null;
  started_at: string;
  activity_name: string;
  hint_count: number;
  questions_completed: number;
  student_email: string;
  student_name: string;
  student_session_id: string;
  org_name: string;
  activity_external_id: string;
}

function normalizeOrgFilter(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.toLowerCase() === "all") {
    return null;
  }

  return trimmed;
}

function buildOrgFilterCondition(orgFilter: string | null): Prisma.Sql {
  if (!orgFilter) {
    return Prisma.sql`TRUE`;
  }

  return Prisma.sql`LOWER(COALESCE(NULLIF(s."orgName", ''), 'unknown')) = LOWER(${orgFilter})`;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const orgFilter = normalizeOrgFilter(searchParams.get("org"));
    const orgFilterCondition = buildOrgFilterCondition(orgFilter);

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
        CASE
          WHEN s.status = 'ENDED'
            OR (
              COALESCE(a."questionCount", 0) > 0
              AND COALESCE(qc.questions_completed, 0) >= COALESCE(a."questionCount", 0)
            )
            THEN 'ENDED'
          ELSE s.status::text
        END AS status,
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
        s."startedAt"::text AS started_at,
        COALESCE(a.title, 'Unknown Activity') AS activity_name,
        COALESCE(hc.hint_count, 0)::int AS hint_count,
        COALESCE(qc.questions_completed, 0)::int AS questions_completed,
        st.email AS student_email,
        COALESCE(NULLIF(st.name, ''), st.email) AS student_name,
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
      WHERE ${orgFilterCondition}
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
    const completionBands = buildCompletionBands(rows);

    return NextResponse.json({
      totalSessions: rows.length,
      rows,
      completionBands,
    });
  } catch (error) {
    console.error("Failed to fetch session metrics:", error);
    return NextResponse.json(
      { error: "Failed to fetch session metrics" },
      { status: 500 },
    );
  }
}
