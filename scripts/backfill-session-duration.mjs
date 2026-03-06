#!/usr/bin/env node

import dotenv from "dotenv";
import { neon } from "@neondatabase/serverless";

dotenv.config();

function withSslModeVerifyFull(rawUrl) {
  const parsed = new URL(rawUrl);
  parsed.searchParams.set("sslmode", "verify-full");
  return parsed.toString();
}

function printUsage() {
  console.info(
    [
      "Usage:",
      "  node scripts/backfill-session-duration.mjs [--dry-run]",
      "",
      "Flags:",
      "  --dry-run  Compute and report updates without writing to the database",
    ].join("\n"),
  );
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
    async exec(text, params = []) {
      return sql.query(text, params, { fullResults: true });
    },
  };
}

const DURATION_MISMATCH_COUNT_SQL = `
  WITH scoped_sessions AS (
    SELECT
      s.id,
      s."roomName",
      s."startedAt",
      s."endedAt",
      s."durationMs"
    FROM "Session" s
  ),
  session_last_events AS (
    SELECT
      ss.id AS session_id,
      MAX(re.timestamp) AS last_event_at
    FROM scoped_sessions ss
    LEFT JOIN "RawEvent" re
      ON re."sessionId" = ss.id
      OR (
        re."sessionId" IS NULL
        AND (re."properties"::jsonb ->> 'room_name') = ss."roomName"
      )
    GROUP BY ss.id
  ),
  expected_durations AS (
    SELECT
      ss.id AS session_id,
      ss."durationMs" AS current_duration_ms,
      CASE
        WHEN sle.last_event_at IS NULL THEN ss."durationMs"
        ELSE GREATEST(
          0,
          (
            EXTRACT(
              EPOCH FROM (
                (
                  CASE
                    WHEN ss."endedAt" IS NOT NULL AND sle.last_event_at > ss."endedAt"
                      THEN ss."endedAt"
                    ELSE sle.last_event_at
                  END
                ) - ss."startedAt"
              )
            ) * 1000
          )::int
        )
      END AS expected_duration_ms
    FROM scoped_sessions ss
    LEFT JOIN session_last_events sle
      ON sle.session_id = ss.id
  )
  SELECT COUNT(*)::int AS total
  FROM expected_durations
  WHERE COALESCE(current_duration_ms, -1) <> COALESCE(expected_duration_ms, -1)
`;

const DURATION_BACKFILL_UPDATE_SQL = `
  WITH scoped_sessions AS (
    SELECT
      s.id,
      s."roomName",
      s."startedAt",
      s."endedAt",
      s."durationMs"
    FROM "Session" s
  ),
  session_last_events AS (
    SELECT
      ss.id AS session_id,
      MAX(re.timestamp) AS last_event_at
    FROM scoped_sessions ss
    LEFT JOIN "RawEvent" re
      ON re."sessionId" = ss.id
      OR (
        re."sessionId" IS NULL
        AND (re."properties"::jsonb ->> 'room_name') = ss."roomName"
      )
    GROUP BY ss.id
  ),
  expected_durations AS (
    SELECT
      ss.id AS session_id,
      CASE
        WHEN sle.last_event_at IS NULL THEN ss."durationMs"
        ELSE GREATEST(
          0,
          (
            EXTRACT(
              EPOCH FROM (
                (
                  CASE
                    WHEN ss."endedAt" IS NOT NULL AND sle.last_event_at > ss."endedAt"
                      THEN ss."endedAt"
                    ELSE sle.last_event_at
                  END
                ) - ss."startedAt"
              )
            ) * 1000
          )::int
        )
      END AS expected_duration_ms
    FROM scoped_sessions ss
    LEFT JOIN session_last_events sle
      ON sle.session_id = ss.id
  )
  UPDATE "Session" s
  SET "durationMs" = ed.expected_duration_ms
  FROM expected_durations ed
  WHERE s.id = ed.session_id
    AND COALESCE(s."durationMs", -1) <> COALESCE(ed.expected_duration_ms, -1)
`;

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printUsage();
    return;
  }

  const dbUrl = process.env.DATABASE_URL;
  const dryRun = process.argv.includes("--dry-run");

  if (!dbUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const db = createNeonDb(withSslModeVerifyFull(dbUrl));

  const sessionCount = await db.query(
    `SELECT COUNT(*)::int AS total FROM "Session"`,
  );
  const mismatchCount = await db.query(DURATION_MISMATCH_COUNT_SQL);

  console.info(
    `[backfill-session-duration] Sessions scanned: ${sessionCount.rows[0].total}`,
  );
  console.info(
    `[backfill-session-duration] Sessions needing duration update: ${mismatchCount.rows[0].total}`,
  );

  if (dryRun) {
    console.info(
      "[backfill-session-duration] Dry run enabled; no DB updates were written.",
    );
    return;
  }

  const updateResult = await db.exec(
    DURATION_BACKFILL_UPDATE_SQL,
    [],
  );
  console.info(
    `[backfill-session-duration] Updated duration rows: ${updateResult.rowCount ?? 0}`,
  );
}

main().catch((error) => {
  console.error("[backfill-session-duration] Failed:", error);
  process.exit(1);
});
