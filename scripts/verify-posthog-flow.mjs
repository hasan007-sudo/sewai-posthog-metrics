#!/usr/bin/env node

import dotenv from "dotenv";
import fs from "node:fs/promises";
import path from "node:path";
import { neon } from "@neondatabase/serverless";

dotenv.config();

const EXPECTED_EVENT_TYPES = [
  "monologue_session_started",
  "monologue_session_end_clicked",
  "monologue_question_completed",
  "monologue_translate_clicked",
  "next_activity_clicked",
  "hint_requested",
  "hint_revealed",
  "hint_followed_by_response",
];

function getArgValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return null;
  }
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) {
    return null;
  }
  return value;
}

function withSslModeVerifyFull(rawUrl) {
  const parsed = new URL(rawUrl);
  parsed.searchParams.set("sslmode", "verify-full");
  return parsed.toString();
}

function printUsage() {
  console.info(
    [
      "Usage:",
      "  node scripts/verify-posthog-flow.mjs [--email <student-email>] [--sample-limit 5] [--source-only]",
      "",
      "Flags:",
      "  --email <value>        Scope verification to one student email",
      "  --sample-limit <value> Number of session rows to print (default: 5)",
      "  --source-only          Run source-level flow contract checks only (no DB)",
    ].join("\n"),
  );
}

function toPositiveInt(value, fallback) {
  if (typeof value !== "string" || !/^[0-9]+$/.test(value)) {
    return fallback;
  }
  return Number.parseInt(value, 10);
}

function printSection(title) {
  console.info(`\n[verify-posthog-flow] ${title}`);
}

function mustBeType(row, key, expectedType) {
  return typeof row[key] === expectedType;
}

function createNeonDb(connectionString) {
  const sql = neon(connectionString);

  return {
    async query(text, params = []) {
      const rows = await sql.query(text, params);
      return {
        rows,
        rowCount: rows.length,
      };
    },
  };
}

async function readFileFromRepo(relativePath) {
  const absolutePath = path.resolve(process.cwd(), relativePath);
  return fs.readFile(absolutePath, "utf8");
}

async function runSourceContractChecks() {
  const processorSource = await readFileFromRepo("src/lib/webhook/processor.ts");
  const reprocessSource = await readFileFromRepo("src/app/api/reprocess/route.ts");
  const metricsRouteSource = await readFileFromRepo(
    "src/app/api/sessions/metrics/route.ts",
  );
  const tableSource = await readFileFromRepo(
    "src/components/dashboard/SessionMetricsTable.tsx",
  );
  const derivedMetricsSource = await readFileFromRepo(
    "src/lib/webhook/session-derived-metrics.ts",
  );

  const checks = [
    {
      name: "processor has all expected PostHog handlers",
      pass: EXPECTED_EVENT_TYPES.every((eventType) =>
        processorSource.includes(`${eventType}:`),
      ),
    },
    {
      name: "processor links room_name events via syncSessionDerivedMetrics",
      pass:
        processorSource.includes("syncSessionDerivedMetrics") &&
        processorSource.includes("const roomName = properties.room_name") &&
        processorSource.includes("eventTimestamp"),
    },
    {
      name: "reprocess route passes timestamp to syncSessionDerivedMetrics",
      pass:
        reprocessSource.includes("syncSessionDerivedMetrics") &&
        reprocessSource.includes("eventTimestamp: raw.timestamp.toISOString()"),
    },
    {
      name: "derived metrics increments translated clicks from translate event and advances duration",
      pass:
        derivedMetricsSource.includes(
          'eventType === "monologue_translate_clicked"',
        ) &&
        derivedMetricsSource.includes("translatedClicksEvents = { increment: 1 }") &&
        derivedMetricsSource.includes('session.status !== "ENDED"') &&
        derivedMetricsSource.includes("candidateDurationMs") &&
        derivedMetricsSource.includes("updateData.durationMs = candidateDurationMs"),
    },
    {
      name: "metrics API exposes expected response fields",
      pass: [
        "AS translated_clicks_events",
        "AS total_questions_of_session",
        "AS duration_of_session_ms",
        "AS started_at",
        "AS activity_name",
        "AS hint_count",
        "AS questions_completed",
        "AS student_email",
        "AS student_name",
        "AS student_session_id",
        "AS org_name",
        "topic_name:",
      ].every((snippet) => metricsRouteSource.includes(snippet)),
    },
    {
      name: "UI table expects the same metrics contract fields",
      pass: [
        "translated_clicks_events:",
        "total_questions_of_session:",
        "duration_of_session_ms:",
        "started_at:",
        "topic_name:",
        "activity_name:",
        "hint_count:",
        "questions_completed:",
        "student_email:",
        "student_name:",
        "student_session_id:",
        "org_name:",
      ].every((snippet) => tableSource.includes(snippet)),
    },
  ];

  return checks;
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printUsage();
    return;
  }

  const emailFilter = getArgValue("--email");
  const sampleLimit = toPositiveInt(getArgValue("--sample-limit"), 5);
  const sourceOnly = process.argv.includes("--source-only");
  const dbUrl = process.env.DATABASE_URL;

  printSection("Source-level flow contract checks");
  const sourceChecks = await runSourceContractChecks();
  sourceChecks.forEach((check) => {
    const status = check.pass ? "PASS" : "FAIL";
    console.info(`[verify-posthog-flow] ${status} - ${check.name}`);
  });

  const sourceFailures = sourceChecks.filter((check) => !check.pass);
  if (sourceFailures.length > 0) {
    process.exitCode = 1;
    return;
  }

  if (sourceOnly) {
    printSection("Result");
    console.info("[verify-posthog-flow] Source-only checks passed.");
    return;
  }

  if (!dbUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const db = createNeonDb(withSslModeVerifyFull(dbUrl));

  try {
    printSection(
      `Running checks (scope=${emailFilter ?? "all students"}, sslmode=verify-full)`,
    );

    const eventSummaryResult = await db.query(
      `
        SELECT
          "eventType" AS event_type,
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE processed = true)::int AS processed,
          COUNT(*) FILTER (WHERE processed = false)::int AS unprocessed,
          MIN(timestamp) AS first_event_at,
          MAX(timestamp) AS last_event_at
        FROM "RawEvent"
        WHERE ($1::text IS NULL OR "distinctId" = $1)
        GROUP BY "eventType"
        ORDER BY total DESC, event_type ASC
      `,
      [emailFilter],
    );

    const eventSummary = eventSummaryResult.rows;
    const seenEventTypes = new Set(eventSummary.map((row) => row.event_type));
    const missingEventTypes = EXPECTED_EVENT_TYPES.filter(
      (eventType) => !seenEventTypes.has(eventType),
    );

    printSection("Raw event summary");
    if (eventSummary.length === 0) {
      console.info("No RawEvent rows matched the selected scope.");
    } else {
      console.table(eventSummary);
    }
    if (missingEventTypes.length > 0) {
      console.warn(
        `[verify-posthog-flow] Missing event types in selected scope: ${missingEventTypes.join(", ")}`,
      );
    }

    const unprocessedResult = await db.query(
      `
        SELECT COUNT(*)::int AS total
        FROM "RawEvent"
        WHERE processed = false
          AND ($1::text IS NULL OR "distinctId" = $1)
      `,
      [emailFilter],
    );
    const unprocessed = unprocessedResult.rows[0]?.total ?? 0;

    printSection("Derived-metric consistency checks");

    const translateMismatchResult = await db.query(
      `
        WITH target_sessions AS (
          SELECT
            s.id,
            s."roomName" AS room_name,
            COALESCE(s."translatedClicksEvents", 0)::int AS translated_clicks_events
          FROM "Session" s
          INNER JOIN "Student" st
            ON st.id = s."studentId"
          WHERE ($1::text IS NULL OR st.email = $1)
        ),
        raw_translate AS (
          SELECT
            COALESCE(re."sessionId", s.id) AS session_id,
            COUNT(*)::int AS raw_translate_count
          FROM "RawEvent" re
          LEFT JOIN "Session" s
            ON s."roomName" = (re."properties"::jsonb ->> 'room_name')
          WHERE re."eventType" = 'monologue_translate_clicked'
            AND ($1::text IS NULL OR re."distinctId" = $1 OR re."sessionId" IN (SELECT id FROM target_sessions))
            AND COALESCE(re."sessionId", s.id) IS NOT NULL
          GROUP BY 1
        )
        SELECT
          ts.session_id,
          ts.room_name,
          ts.translated_clicks_events,
          COALESCE(rt.raw_translate_count, 0)::int AS raw_translate_count
        FROM (
          SELECT id AS session_id, room_name, translated_clicks_events
          FROM target_sessions
        ) ts
        LEFT JOIN raw_translate rt
          ON rt.session_id = ts.session_id
        WHERE ts.translated_clicks_events <> COALESCE(rt.raw_translate_count, 0)
        ORDER BY ts.room_name
      `,
      [emailFilter],
    );

    const questionMismatchResult = await db.query(
      `
        WITH target_sessions AS (
          SELECT s.id
          FROM "Session" s
          INNER JOIN "Student" st
            ON st.id = s."studentId"
          WHERE ($1::text IS NULL OR st.email = $1)
        ),
        raw_questions AS (
          SELECT
            COALESCE(re."sessionId", s.id) AS session_id,
            COUNT(DISTINCT NULLIF(re."properties"::jsonb ->> 'question_id', ''))::int AS raw_questions
          FROM "RawEvent" re
          LEFT JOIN "Session" s
            ON s."roomName" = (re."properties"::jsonb ->> 'room_name')
          WHERE re."eventType" = 'monologue_question_completed'
            AND ($1::text IS NULL OR re."distinctId" = $1 OR re."sessionId" IN (SELECT id FROM target_sessions))
            AND COALESCE(re."sessionId", s.id) IS NOT NULL
          GROUP BY 1
        ),
        db_questions AS (
          SELECT
            qp."sessionId" AS session_id,
            COUNT(*)::int AS db_questions
          FROM "QuestionProgress" qp
          WHERE qp."sessionId" IN (SELECT id FROM target_sessions)
          GROUP BY qp."sessionId"
        )
        SELECT
          ts.id AS session_id,
          COALESCE(rq.raw_questions, 0)::int AS raw_questions,
          COALESCE(dq.db_questions, 0)::int AS db_questions
        FROM target_sessions ts
        LEFT JOIN raw_questions rq
          ON rq.session_id = ts.id
        LEFT JOIN db_questions dq
          ON dq.session_id = ts.id
        WHERE COALESCE(rq.raw_questions, 0) <> COALESCE(dq.db_questions, 0)
      `,
      [emailFilter],
    );

    const hintMismatchResult = await db.query(
      `
        WITH target_sessions AS (
          SELECT s.id
          FROM "Session" s
          INNER JOIN "Student" st
            ON st.id = s."studentId"
          WHERE ($1::text IS NULL OR st.email = $1)
        ),
        raw_hints AS (
          SELECT
            COALESCE(re."sessionId", s.id) AS session_id,
            COUNT(*)::int AS raw_hint_requested
          FROM "RawEvent" re
          LEFT JOIN "Session" s
            ON s."roomName" = (re."properties"::jsonb ->> 'room_name')
          WHERE re."eventType" = 'hint_requested'
            AND ($1::text IS NULL OR re."distinctId" = $1 OR re."sessionId" IN (SELECT id FROM target_sessions))
            AND COALESCE(re."sessionId", s.id) IS NOT NULL
          GROUP BY 1
        ),
        db_hints AS (
          SELECT
            hu."sessionId" AS session_id,
            COUNT(*)::int AS db_hint_usage
          FROM "HintUsage" hu
          WHERE hu."sessionId" IN (SELECT id FROM target_sessions)
          GROUP BY hu."sessionId"
        )
        SELECT
          ts.id AS session_id,
          COALESCE(rh.raw_hint_requested, 0)::int AS raw_hint_requested,
          COALESCE(dh.db_hint_usage, 0)::int AS db_hint_usage
        FROM target_sessions ts
        LEFT JOIN raw_hints rh
          ON rh.session_id = ts.id
        LEFT JOIN db_hints dh
          ON dh.session_id = ts.id
        WHERE COALESCE(rh.raw_hint_requested, 0) <> COALESCE(dh.db_hint_usage, 0)
      `,
      [emailFilter],
    );

    const durationMismatchResult = await db.query(
      `
        WITH target_sessions AS (
          SELECT
            s.id,
            s."roomName",
            s."startedAt",
            s."endedAt",
            s."durationMs"
          FROM "Session" s
          INNER JOIN "Student" st
            ON st.id = s."studentId"
          WHERE ($1::text IS NULL OR st.email = $1)
        ),
        last_session_events AS (
          SELECT
            ts.id AS session_id,
            MAX(re.timestamp) AS last_event_at
          FROM target_sessions ts
          LEFT JOIN "RawEvent" re
            ON re."sessionId" = ts.id
            OR (
              re."sessionId" IS NULL
              AND (re."properties"::jsonb ->> 'room_name') = ts."roomName"
            )
          GROUP BY ts.id
        ),
        expected_durations AS (
          SELECT
            ts.id AS session_id,
            ts."roomName" AS room_name,
            ts."durationMs" AS current_duration_ms,
            CASE
              WHEN lse.last_event_at IS NULL THEN ts."durationMs"
              ELSE GREATEST(
                0,
                (
                  EXTRACT(
                    EPOCH FROM (
                      (
                        CASE
                          WHEN ts."endedAt" IS NOT NULL
                            AND lse.last_event_at > ts."endedAt"
                            THEN ts."endedAt"
                          ELSE lse.last_event_at
                        END
                      ) - ts."startedAt"
                    )
                  ) * 1000
                )::int
              )
            END AS expected_duration_ms
          FROM target_sessions ts
          LEFT JOIN last_session_events lse
            ON lse.session_id = ts.id
        )
        SELECT
          session_id,
          room_name,
          current_duration_ms,
          expected_duration_ms
        FROM expected_durations
        WHERE COALESCE(current_duration_ms, -1) <> COALESCE(expected_duration_ms, -1)
      `,
      [emailFilter],
    );

    const endedDurationCapMismatchResult = await db.query(
      `
        WITH target_sessions AS (
          SELECT
            s.id,
            s."roomName",
            s."startedAt",
            s."endedAt",
            s."durationMs"
          FROM "Session" s
          INNER JOIN "Student" st
            ON st.id = s."studentId"
          WHERE ($1::text IS NULL OR st.email = $1)
        )
        SELECT
          ts.id AS session_id,
          ts."roomName" AS room_name,
          ts."durationMs" AS current_duration_ms,
          GREATEST(
            0,
            (EXTRACT(EPOCH FROM (ts."endedAt" - ts."startedAt")) * 1000)::int
          ) AS ended_cap_duration_ms
        FROM target_sessions ts
        WHERE ts."endedAt" IS NOT NULL
          AND ts."durationMs" IS NOT NULL
          AND ts."durationMs" > GREATEST(
            0,
            (EXTRACT(EPOCH FROM (ts."endedAt" - ts."startedAt")) * 1000)::int
          )
      `,
      [emailFilter],
    );

    console.info(
      `[verify-posthog-flow] translate mismatch sessions: ${translateMismatchResult.rowCount ?? 0}`,
    );
    console.info(
      `[verify-posthog-flow] question mismatch sessions: ${questionMismatchResult.rowCount ?? 0}`,
    );
    console.info(
      `[verify-posthog-flow] hint mismatch sessions: ${hintMismatchResult.rowCount ?? 0}`,
    );
    console.info(
      `[verify-posthog-flow] duration mismatch sessions: ${durationMismatchResult.rowCount ?? 0}`,
    );
    console.info(
      `[verify-posthog-flow] ended-cap mismatch sessions: ${endedDurationCapMismatchResult.rowCount ?? 0}`,
    );
    console.info(
      `[verify-posthog-flow] unprocessed raw events: ${unprocessed}`,
    );

    if ((translateMismatchResult.rowCount ?? 0) > 0) {
      console.table(translateMismatchResult.rows.slice(0, 10));
    }
    if ((questionMismatchResult.rowCount ?? 0) > 0) {
      console.table(questionMismatchResult.rows.slice(0, 10));
    }
    if ((hintMismatchResult.rowCount ?? 0) > 0) {
      console.table(hintMismatchResult.rows.slice(0, 10));
    }
    if ((durationMismatchResult.rowCount ?? 0) > 0) {
      console.table(durationMismatchResult.rows.slice(0, 10));
    }
    if ((endedDurationCapMismatchResult.rowCount ?? 0) > 0) {
      console.table(endedDurationCapMismatchResult.rows.slice(0, 10));
    }

    printSection("UI contract sample (/api/sessions/metrics shape)");

    const sampleRowsResult = await db.query(
      `
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
          '-'::text AS topic_name,
          COALESCE(a.title, 'Unknown Activity') AS activity_name,
          COALESCE(hc.hint_count, 0)::int AS hint_count,
          COALESCE(qc.questions_completed, 0)::int AS questions_completed,
          st.email AS student_email,
          COALESCE(NULLIF(st.name, ''), st.email) AS student_name,
          s."roomName" AS student_session_id,
          COALESCE(NULLIF(s."orgName", ''), 'unknown') AS org_name
        FROM "Session" s
        INNER JOIN "Student" st
          ON st.id = s."studentId"
        LEFT JOIN "Activity" a
          ON a.id = s."activityId"
        LEFT JOIN question_counts qc
          ON qc.session_id = s.id
        LEFT JOIN hint_counts hc
          ON hc.session_id = s.id
        WHERE ($1::text IS NULL OR st.email = $1)
        ORDER BY s."startedAt" DESC
        LIMIT $2
      `,
      [emailFilter, sampleLimit],
    );

    const sampleRows = sampleRowsResult.rows;
    if (sampleRows.length === 0) {
      console.info("No session rows matched the selected scope.");
    } else {
      console.table(sampleRows);
    }

    const invalidRows = sampleRows.filter((row) => {
      return !(
        mustBeType(row, "status", "string") &&
        mustBeType(row, "translated_clicks_events", "number") &&
        mustBeType(row, "total_questions_of_session", "number") &&
        (row.duration_of_session_ms === null ||
          mustBeType(row, "duration_of_session_ms", "number")) &&
        mustBeType(row, "started_at", "string") &&
        mustBeType(row, "topic_name", "string") &&
        mustBeType(row, "activity_name", "string") &&
        mustBeType(row, "hint_count", "number") &&
        mustBeType(row, "questions_completed", "number") &&
        mustBeType(row, "student_email", "string") &&
        mustBeType(row, "student_name", "string") &&
        mustBeType(row, "student_session_id", "string") &&
        mustBeType(row, "org_name", "string")
      );
    });

    const hasFailures =
      unprocessed > 0 ||
      (translateMismatchResult.rowCount ?? 0) > 0 ||
      (questionMismatchResult.rowCount ?? 0) > 0 ||
      (hintMismatchResult.rowCount ?? 0) > 0 ||
      (durationMismatchResult.rowCount ?? 0) > 0 ||
      (endedDurationCapMismatchResult.rowCount ?? 0) > 0 ||
      invalidRows.length > 0;

    printSection("Result");
    if (invalidRows.length > 0) {
      console.warn(
        `[verify-posthog-flow] Invalid session metric row shapes: ${invalidRows.length}`,
      );
    }

    if (hasFailures) {
      console.warn(
        "[verify-posthog-flow] Verification finished with warnings. Review mismatch tables above.",
      );
      process.exitCode = 1;
      return;
    }

    console.info("[verify-posthog-flow] All checks passed.");
  } finally {
    // no-op: Neon HTTP query client does not keep a pooled socket to close
  }
}

main().catch((error) => {
  console.error("[verify-posthog-flow] Failed:", error);
  process.exit(1);
});
