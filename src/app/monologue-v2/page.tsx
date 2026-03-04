import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { StatsCards } from "@/components/dashboard/StatsCards";
import { StudentTable } from "@/components/dashboard/StudentTable";
import { SessionMetricsTable } from "@/components/dashboard/SessionMetricsTable";
import {
  ActivityCompletionBarChart,
  type ActivityCompletionBin,
} from "@/components/dashboard/ActivityCompletionBarChart";
import { TopOrgFilter } from "@/components/dashboard/TopOrgFilter";

export const dynamic = "force-dynamic";

interface StatsAggregateRow {
  total_students: number;
  total_sessions: number;
  started_sessions: number;
  ended_sessions: number;
  abandoned_sessions: number;
  total_questions_completed: number;
  total_hint_usages: number;
  not_ended_stale_sessions: number;
  hint_used_sessions: number;
  translate_used_sessions: number;
  completed_all_and_ended_sessions: number;
  ended_before_q1_complete_sessions: number;
}

interface ActivityCompletionDistributionRow {
  completion_pct: number;
  session_count: number;
}

interface OrgOptionRow {
  org_name: string;
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

  return trimmed;
}

function buildOrgFilterCondition(orgFilter: string | null): Prisma.Sql {
  if (!orgFilter) {
    return Prisma.sql`TRUE`;
  }

  return Prisma.sql`COALESCE(NULLIF(s."orgName", ''), 'unknown') = ${orgFilter}`;
}

async function getStats(orgFilter: string | null) {
  const orgFilterCondition = buildOrgFilterCondition(orgFilter);

  const result = await prisma.$queryRaw<StatsAggregateRow[]>`
    WITH filtered_sessions AS (
      SELECT
        s.id,
        s."studentId",
        s."activityId",
        s.status,
        s."startedAt",
        s."translatedClicksEvents"
      FROM "Session" s
      WHERE ${orgFilterCondition}
    ),
    question_counts AS (
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
    ),
    session_rollup AS (
      SELECT
        fs.id,
        fs.status::text AS raw_status,
        fs."startedAt" AS started_at,
        fs."studentId" AS student_id,
        COALESCE(a."questionCount", 0)::int AS question_count,
        COALESCE(qc.questions_completed, 0)::int AS questions_completed,
        COALESCE(hc.hint_count, 0)::int AS hint_count,
        COALESCE(fs."translatedClicksEvents", 0)::int AS translated_clicks,
        CASE
          WHEN fs.status = 'ENDED'
            OR (
              COALESCE(a."questionCount", 0) > 0
              AND COALESCE(qc.questions_completed, 0) >= COALESCE(a."questionCount", 0)
            )
            THEN 'ENDED'
          ELSE fs.status::text
        END AS effective_status
      FROM filtered_sessions fs
      LEFT JOIN "Activity" a
        ON a.id = fs."activityId"
      LEFT JOIN question_counts qc
        ON qc.session_id = fs.id
      LEFT JOIN hint_counts hc
        ON hc.session_id = fs.id
    )
    SELECT
      COALESCE(
        (SELECT COUNT(DISTINCT student_id)::int FROM session_rollup),
        0
      )::int AS total_students,
      COUNT(*)::int AS total_sessions,
      COUNT(*) FILTER (WHERE effective_status = 'STARTED')::int AS started_sessions,
      COUNT(*) FILTER (WHERE effective_status = 'ENDED')::int AS ended_sessions,
      COUNT(*) FILTER (WHERE effective_status = 'ABANDONED')::int AS abandoned_sessions,
      COALESCE(SUM(questions_completed), 0)::int AS total_questions_completed,
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
  `;

  const row = result[0];
  const totalSessions = row?.total_sessions ?? 0;
  const endedCount = row?.ended_sessions ?? 0;
  const totalQuestionsCompleted = row?.total_questions_completed ?? 0;

  const pct = (count: number): number =>
    totalSessions > 0 ? Math.round((count / totalSessions) * 1000) / 10 : 0;

  const avgQuestionsPerSession =
    endedCount > 0 ? totalQuestionsCompleted / endedCount : 0;

  return {
    totalStudents: row?.total_students ?? 0,
    totalSessions,
    sessionsByStatus: {
      STARTED: row?.started_sessions ?? 0,
      ENDED: endedCount,
      ABANDONED: row?.abandoned_sessions ?? 0,
    },
    totalQuestionsCompleted,
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

async function getCompletionDistribution(orgFilter: string | null) {
  const orgFilterCondition = buildOrgFilterCondition(orgFilter);

  return prisma.$queryRaw<ActivityCompletionDistributionRow[]>`
    WITH filtered_sessions AS (
      SELECT
        s.id,
        s."activityId"
      FROM "Session" s
      WHERE ${orgFilterCondition}
    ),
    question_counts AS (
      SELECT
        qp."sessionId" AS session_id,
        COUNT(*)::int AS questions_completed
      FROM "QuestionProgress" qp
      GROUP BY qp."sessionId"
    )
    SELECT
      LEAST(
        100,
        GREATEST(
          0,
          ROUND(
            (
              COALESCE(qc.questions_completed, 0)::numeric * 100
            ) / NULLIF(a."questionCount", 0)
          )::int
        )
      )::int AS completion_pct,
      COUNT(*)::int AS session_count
    FROM filtered_sessions fs
    INNER JOIN "Activity" a
      ON a.id = fs."activityId"
    LEFT JOIN question_counts qc
      ON qc.session_id = fs.id
    WHERE a."questionCount" > 0
    GROUP BY 1
    ORDER BY 1
  `;
}

async function getOrgOptions() {
  const rows = await prisma.$queryRaw<OrgOptionRow[]>`
    SELECT DISTINCT
      COALESCE(NULLIF(s."orgName", ''), 'unknown') AS org_name
    FROM "Session" s
    ORDER BY org_name ASC
  `;

  return rows.map((row) => row.org_name);
}

export default async function MonologueDashboardPage({ searchParams }: PageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const selectedOrg = normalizeOrgFilter(toSingleValue(resolvedSearchParams?.org));

  const [stats, completionDistribution, orgOptions] = await Promise.all([
    getStats(selectedOrg),
    getCompletionDistribution(selectedOrg),
    getOrgOptions(),
  ]);

  const completionBins: ActivityCompletionBin[] = completionDistribution.map((row) => ({
    completionPct: row.completion_pct,
    sessionCount: row.session_count,
  }));

  const selectedOrgLabel = selectedOrg ?? "All orgs";

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Monologue v2</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Monologue learning analytics overview
          </p>
          <p className="text-muted-foreground text-xs mt-2">
            Top metrics scope: {selectedOrgLabel}
          </p>
        </div>

        <TopOrgFilter orgOptions={orgOptions} selectedOrg={selectedOrg} />
      </div>

      <StatsCards stats={stats} />

      <div>
        <h2 className="text-lg font-semibold mb-4">Activity Completion</h2>
        <ActivityCompletionBarChart bins={completionBins} />
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-4">Sessions</h2>
        <SessionMetricsTable />
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-4">Students</h2>
        <StudentTable />
      </div>
    </div>
  );
}
