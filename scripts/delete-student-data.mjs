#!/usr/bin/env node

import dotenv from "dotenv";
import { neon } from "@neondatabase/serverless";

dotenv.config();

const DEFAULT_EMAIL = "students@demo.com";

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
      "  node scripts/delete-student-data.mjs [--email students@demo.com] [--execute]",
      "",
      "Flags:",
      "  --email <value>  Student email to remove (default: students@demo.com)",
      "  --execute        Execute deletions (without this, script runs in dry-run mode)",
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
  };
}

async function fetchScopedCounts(client, email) {
  const result = await client.query(
    `
      WITH target_student AS (
        SELECT id
        FROM "Student"
        WHERE email = $1
      ),
      target_sessions AS (
        SELECT id
        FROM "Session"
        WHERE "studentId" IN (SELECT id FROM target_student)
      ),
      target_raw_events AS (
        SELECT id
        FROM "RawEvent"
        WHERE "distinctId" = $1
           OR "sessionId" IN (SELECT id FROM target_sessions)
      )
      SELECT
        (SELECT COUNT(*)::int FROM target_student) AS students,
        (SELECT COUNT(*)::int FROM target_sessions) AS sessions,
        (
          SELECT COUNT(*)::int
          FROM "QuestionProgress"
          WHERE "sessionId" IN (SELECT id FROM target_sessions)
        ) AS question_progress,
        (
          SELECT COUNT(*)::int
          FROM "HintUsage"
          WHERE "sessionId" IN (SELECT id FROM target_sessions)
        ) AS hint_usage,
        (
          SELECT COUNT(*)::int
          FROM "NextActivityClick"
          WHERE "studentId" IN (SELECT id FROM target_student)
        ) AS next_activity_clicks,
        (SELECT COUNT(*)::int FROM target_raw_events) AS raw_events
    `,
    [email],
  );

  return result.rows[0];
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printUsage();
    return;
  }

  const email = getArgValue("--email") ?? DEFAULT_EMAIL;
  const execute = process.argv.includes("--execute");
  const dbUrl = process.env.DATABASE_URL;

  if (!dbUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const connectionString = withSslModeVerifyFull(dbUrl);
  const db = createNeonDb(connectionString);

  const before = await fetchScopedCounts(db, email);
  console.info(
    `[delete-student-data] Target email: ${email} (sslmode=verify-full)`,
  );
  console.info(
    `[delete-student-data] Before: ${JSON.stringify(before)}`,
  );

  if (!execute) {
    console.info(
      "[delete-student-data] Dry run complete. Re-run with --execute to delete rows.",
    );
    return;
  }

  const deleteResult = await db.query(
    `
      WITH target_student AS (
        SELECT id
        FROM "Student"
        WHERE email = $1
      ),
      target_sessions AS (
        SELECT id
        FROM "Session"
        WHERE "studentId" IN (SELECT id FROM target_student)
      ),
      deleted_raw_events AS (
        DELETE FROM "RawEvent"
        WHERE "distinctId" = $1
           OR "sessionId" IN (SELECT id FROM target_sessions)
        RETURNING 1
      ),
      deleted_question_progress AS (
        DELETE FROM "QuestionProgress"
        WHERE "sessionId" IN (SELECT id FROM target_sessions)
        RETURNING 1
      ),
      deleted_hint_usage AS (
        DELETE FROM "HintUsage"
        WHERE "sessionId" IN (SELECT id FROM target_sessions)
        RETURNING 1
      ),
      deleted_next_activity AS (
        DELETE FROM "NextActivityClick"
        WHERE "studentId" IN (SELECT id FROM target_student)
        RETURNING 1
      ),
      deleted_sessions AS (
        DELETE FROM "Session"
        WHERE "studentId" IN (SELECT id FROM target_student)
        RETURNING 1
      ),
      deleted_students AS (
        DELETE FROM "Student"
        WHERE email = $1
        RETURNING 1
      )
      SELECT
        (SELECT COUNT(*)::int FROM deleted_raw_events) AS raw_events,
        (SELECT COUNT(*)::int FROM deleted_question_progress) AS question_progress,
        (SELECT COUNT(*)::int FROM deleted_hint_usage) AS hint_usage,
        (SELECT COUNT(*)::int FROM deleted_next_activity) AS next_activity_clicks,
        (SELECT COUNT(*)::int FROM deleted_sessions) AS sessions,
        (SELECT COUNT(*)::int FROM deleted_students) AS students
    `,
    [email],
  );

  console.info(
    `[delete-student-data] Deleted: ${JSON.stringify(deleteResult.rows[0])}`,
  );

  const after = await fetchScopedCounts(db, email);
  console.info(`[delete-student-data] After: ${JSON.stringify(after)}`);
}

main().catch((error) => {
  console.error("[delete-student-data] Failed:", error);
  process.exit(1);
});
