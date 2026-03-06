import { prisma, withTransientRetry } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { StatsCards } from "@/components/dashboard/StatsCards";
import { SessionMetricsTable } from "@/components/dashboard/SessionMetricsTable";

export const dynamic = "force-dynamic";

interface StatsAggregateRow {
  total_students: number;
  total_sessions: number;
  started_sessions: number;
  ended_sessions: number;
  abandoned_sessions: number;
  total_questions_completed: number;
  total_duration_ms: number | string | bigint;
  total_hint_usages: number;
  not_ended_stale_sessions: number;
  hint_used_sessions: number;
  translate_used_sessions: number;
  completed_all_and_ended_sessions: number;
  ended_before_q1_complete_sessions: number;
}

interface PageProps {
  searchParams?:
    | Promise<{
        org?: string | string[];
      }>
    | {
        org?: string | string[];
      };
}

const FIXED_ORG_FILTERS = ["FSSA", "DET", "demo"] as const;

interface DashboardStats {
  totalStudents: number;
  totalSessions: number;
  sessionsByStatus: {
    STARTED: number;
    ENDED: number;
    ABANDONED: number;
  };
  totalQuestionsCompleted: number;
  totalDurationMs: number;
  avgQuestionsPerSession: number;
  totalHintUsages: number;
  outcomes: {
    endedConversations: { count: number; pct: number };
    notEndedStale: { count: number; pct: number };
    hintUsedAtLeastOnce: { count: number; pct: number };
    translateUsedAtLeastOnce: { count: number; pct: number };
    completedAllAndEnded: { count: number; pct: number };
    endedBeforeQ1Complete: { count: number; pct: number };
  };
}

function toSingleValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

function normalizeOrgFilter(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.toLowerCase() === "all") {
    return null;
  }

  const matched = FIXED_ORG_FILTERS.find(
    (orgName) => orgName.toLowerCase() === trimmed.toLowerCase(),
  );

  return matched ?? null;
}

function buildOrgFilterCondition(orgFilter: string | null): Prisma.Sql {
  if (!orgFilter) {
    return Prisma.sql`TRUE`;
  }

  return Prisma.sql`LOWER(COALESCE(NULLIF(s."orgName", ''), 'unknown')) = LOWER(${orgFilter})`;
}

function buildEmptyStats(): DashboardStats {
  return {
    totalStudents: 0,
    totalSessions: 0,
    sessionsByStatus: {
      STARTED: 0,
      ENDED: 0,
      ABANDONED: 0,
    },
    totalQuestionsCompleted: 0,
    totalDurationMs: 0,
    avgQuestionsPerSession: 0,
    totalHintUsages: 0,
    outcomes: {
      endedConversations: { count: 0, pct: 0 },
      notEndedStale: { count: 0, pct: 0 },
      hintUsedAtLeastOnce: { count: 0, pct: 0 },
      translateUsedAtLeastOnce: { count: 0, pct: 0 },
      completedAllAndEnded: { count: 0, pct: 0 },
      endedBeforeQ1Complete: { count: 0, pct: 0 },
    },
  };
}

async function getStats(orgFilter: string | null): Promise<DashboardStats> {
  const orgFilterCondition = buildOrgFilterCondition(orgFilter);

  const result = await withTransientRetry(async (client) =>
    client.$queryRaw<StatsAggregateRow[]>`
    WITH filtered_sessions AS (
      SELECT
        s.id,
        s."studentId",
        s.status,
        s."startedAt",
        COALESCE(s."translatedClicksEvents", 0)::int AS translated_clicks,
        COALESCE(s."durationMs", 0)::int AS duration_ms,
        COALESCE(a."questionCount", 0)::int AS question_count
      FROM "Session" s
      LEFT JOIN "Activity" a
        ON a.id = s."activityId"
      WHERE ${orgFilterCondition}
    ),
    session_rollup AS (
      SELECT
        fs.id,
        fs.status::text AS raw_status,
        fs."startedAt" AS started_at,
        fs."studentId" AS student_id,
        fs.question_count,
        fs.duration_ms,
        COALESCE(qc.questions_completed, 0)::int AS questions_completed,
        COALESCE(hc.hint_count, 0)::int AS hint_count,
        fs.translated_clicks,
        CASE
          WHEN fs.status = 'ENDED'
            OR (
              fs.question_count > 0
              AND COALESCE(qc.questions_completed, 0) >= fs.question_count
            )
            THEN 'ENDED'
          ELSE fs.status::text
        END AS effective_status
      FROM filtered_sessions fs
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS questions_completed
        FROM "QuestionProgress" qp
        WHERE qp."sessionId" = fs.id
      ) qc ON TRUE
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS hint_count
        FROM "HintUsage" hu
        WHERE hu."sessionId" = fs.id
      ) hc ON TRUE
    )
    SELECT
      COUNT(DISTINCT student_id)::int AS total_students,
      COUNT(*)::int AS total_sessions,
      COUNT(*) FILTER (WHERE effective_status = 'STARTED')::int AS started_sessions,
      COUNT(*) FILTER (WHERE effective_status = 'ENDED')::int AS ended_sessions,
      COUNT(*) FILTER (WHERE effective_status = 'ABANDONED')::int AS abandoned_sessions,
      COALESCE(SUM(questions_completed), 0)::int AS total_questions_completed,
      COALESCE(SUM(duration_ms), 0)::bigint AS total_duration_ms,
      COALESCE(SUM(hint_count), 0)::int AS total_hint_usages,
      COUNT(*) FILTER (
        WHERE effective_status = 'STARTED'
          AND started_at < NOW() - make_interval(hours => 24)
      )::int AS not_ended_stale_sessions,
      COUNT(*) FILTER (WHERE hint_count > 0)::int AS hint_used_sessions,
      COUNT(*) FILTER (WHERE translated_clicks > 0)::int AS translate_used_sessions,
      COUNT(*) FILTER (
        WHERE effective_status = 'ENDED'
          AND question_count > 0
          AND questions_completed >= question_count
      )::int AS completed_all_and_ended_sessions,
      COUNT(*) FILTER (
        WHERE effective_status = 'ENDED'
          AND questions_completed = 0
      )::int AS ended_before_q1_complete_sessions
    FROM session_rollup
  `);

  const row = result[0];
  const totalSessions = row?.total_sessions ?? 0;
  const endedCount = row?.ended_sessions ?? 0;
  const totalQuestionsCompleted = row?.total_questions_completed ?? 0;

  const pct = (count: number): number =>
    totalSessions > 0 ? Math.round((count / totalSessions) * 1000) / 10 : 0;

  const avgQuestionsPerSession =
    endedCount > 0 ? totalQuestionsCompleted / endedCount : 0;

  const rawTotalDurationMs = row?.total_duration_ms ?? 0;
  const totalDurationMs =
    typeof rawTotalDurationMs === "number"
      ? rawTotalDurationMs
      : Number(rawTotalDurationMs);

  return {
    totalStudents: row?.total_students ?? 0,
    totalSessions,
    sessionsByStatus: {
      STARTED: row?.started_sessions ?? 0,
      ENDED: endedCount,
      ABANDONED: row?.abandoned_sessions ?? 0,
    },
    totalQuestionsCompleted,
    totalDurationMs: Number.isFinite(totalDurationMs) ? totalDurationMs : 0,
    avgQuestionsPerSession: Math.round(avgQuestionsPerSession * 100) / 100,
    totalHintUsages: row?.total_hint_usages ?? 0,
    outcomes: {
      endedConversations: {
        count: endedCount,
        pct: pct(endedCount),
      },
      notEndedStale: {
        count: row?.not_ended_stale_sessions ?? 0,
        pct: pct(row?.not_ended_stale_sessions ?? 0),
      },
      hintUsedAtLeastOnce: {
        count: row?.hint_used_sessions ?? 0,
        pct: pct(row?.hint_used_sessions ?? 0),
      },
      translateUsedAtLeastOnce: {
        count: row?.translate_used_sessions ?? 0,
        pct: pct(row?.translate_used_sessions ?? 0),
      },
      completedAllAndEnded: {
        count: row?.completed_all_and_ended_sessions ?? 0,
        pct: pct(row?.completed_all_and_ended_sessions ?? 0),
      },
      endedBeforeQ1Complete: {
        count: row?.ended_before_q1_complete_sessions ?? 0,
        pct: pct(row?.ended_before_q1_complete_sessions ?? 0),
      },
    },
  };
}

export default async function MonologueDashboardPage({
  searchParams,
}: PageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const selectedOrg = normalizeOrgFilter(
    toSingleValue(resolvedSearchParams?.org),
  );

  const stats = await getStats(selectedOrg);
  const selectedOrgLabel = selectedOrg ?? "All orgs";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Monologue v2</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Monologue learning analytics overview
        </p>
        <p className="text-muted-foreground text-xs mt-2">
          Top metrics scope: {selectedOrgLabel}
        </p>
      </div>

      <StatsCards stats={stats} />

      <div>
        <h2 className="text-lg font-semibold mb-4">Sessions</h2>
        <SessionMetricsTable selectedOrg={selectedOrg} />
      </div>

      {/* <div>
        <h2 className="text-lg font-semibold mb-4">Students</h2>
        <StudentTable />
      </div> */}
    </div>
  );
}
