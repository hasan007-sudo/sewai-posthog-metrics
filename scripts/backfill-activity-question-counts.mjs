#!/usr/bin/env node

import dotenv from "dotenv";
import { Client } from "pg";

dotenv.config();

const BATCH_SIZE = 500;

function withSslModeRequire(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    if (!parsed.searchParams.has("sslmode")) {
      parsed.searchParams.set("sslmode", "require");
      return { connectionString: parsed.toString(), sslModeAutoApplied: true };
    }
    return { connectionString: parsed.toString(), sslModeAutoApplied: false };
  } catch {
    return { connectionString: rawUrl, sslModeAutoApplied: false };
  }
}

function chunk(values, size) {
  const chunks = [];
  for (let i = 0; i < values.length; i += size) {
    chunks.push(values.slice(i, i + size));
  }
  return chunks;
}

async function fetchMetricsActivities(metricsClient) {
  const result = await metricsClient.query(`
    SELECT
      "externalId" AS external_id,
      COALESCE("questionCount", 0)::int AS question_count
    FROM "Activity"
    WHERE "externalId" IS NOT NULL
      AND "externalId" <> ''
  `);

  return result.rows;
}

async function fetchSewaiQuestionCounts(sewaiClient, activityIds) {
  const counts = new Map();
  const idBatches = chunk(activityIds, BATCH_SIZE);

  for (const idBatch of idBatches) {
    const result = await sewaiClient.query(
      `
        SELECT
          a.id AS activity_id,
          COALESCE(
            jsonb_array_length(
              CASE
                WHEN jsonb_typeof(a.config::jsonb -> 'questions') = 'array'
                  THEN a.config::jsonb -> 'questions'
                ELSE '[]'::jsonb
              END
            ),
            0
          )::int AS configured_question_count
        FROM activities a
        WHERE a.id = ANY($1::text[])
      `,
      [idBatch],
    );

    for (const row of result.rows) {
      counts.set(row.activity_id, Number(row.configured_question_count) || 0);
    }
  }

  return counts;
}

async function applyBackfillUpdates(metricsClient, updates) {
  let totalUpdatedRows = 0;
  const updateBatches = chunk(updates, BATCH_SIZE);

  for (const updateBatch of updateBatches) {
    const values = [];
    const params = [];

    updateBatch.forEach((update, index) => {
      const base = index * 2;
      values.push(`($${base + 1}::text, $${base + 2}::int)`);
      params.push(update.externalId, update.questionCount);
    });

    const result = await metricsClient.query(
      `
        UPDATE "Activity" AS a
        SET "questionCount" = v.question_count
        FROM (VALUES ${values.join(", ")}) AS v(external_id, question_count)
        WHERE a."externalId" = v.external_id
          AND a."questionCount" < v.question_count
      `,
      params,
    );

    totalUpdatedRows += result.rowCount;
  }

  return totalUpdatedRows;
}

async function main() {
  const metricsDbUrl = process.env.DATABASE_URL;
  const sewaiDbUrlRaw = process.env.SEWAI_DATABASE_URL;
  const dryRun = process.argv.includes("--dry-run");

  if (!metricsDbUrl) {
    throw new Error("DATABASE_URL is required");
  }
  if (!sewaiDbUrlRaw) {
    throw new Error("SEWAI_DATABASE_URL is required");
  }

  const { connectionString: sewaiDbUrl, sslModeAutoApplied } =
    withSslModeRequire(sewaiDbUrlRaw);

  if (sslModeAutoApplied) {
    console.info(
      "[backfill-activity-question-counts] Auto-applied sslmode=require to SEWAI_DATABASE_URL.",
    );
  }

  const metricsClient = new Client({ connectionString: metricsDbUrl });
  const sewaiClient = new Client({ connectionString: sewaiDbUrl });

  await metricsClient.connect();
  await sewaiClient.connect();

  try {
    const activities = await fetchMetricsActivities(metricsClient);
    const activityIds = activities.map((activity) => activity.external_id);

    const sewaiQuestionCounts = await fetchSewaiQuestionCounts(
      sewaiClient,
      activityIds,
    );

    const updates = activities
      .map((activity) => {
        const configuredQuestionCount =
          sewaiQuestionCounts.get(activity.external_id) ?? 0;
        const currentQuestionCount = Number(activity.question_count) || 0;

        if (
          configuredQuestionCount > 0 &&
          currentQuestionCount < configuredQuestionCount
        ) {
          return {
            externalId: activity.external_id,
            questionCount: configuredQuestionCount,
          };
        }

        return null;
      })
      .filter(Boolean);

    console.info(
      `[backfill-activity-question-counts] Activities scanned: ${activities.length}`,
    );
    console.info(
      `[backfill-activity-question-counts] Activities needing update: ${updates.length}`,
    );

    if (updates.length === 0) {
      console.info("[backfill-activity-question-counts] No updates required.");
      return;
    }

    if (dryRun) {
      console.info(
        "[backfill-activity-question-counts] Dry run enabled; no DB updates were written.",
      );
      return;
    }

    const updatedRows = await applyBackfillUpdates(metricsClient, updates);
    console.info(
      `[backfill-activity-question-counts] Updated Activity rows: ${updatedRows}`,
    );
  } finally {
    await Promise.all([metricsClient.end(), sewaiClient.end()]);
  }
}

main().catch((error) => {
  console.error("[backfill-activity-question-counts] Failed:", error);
  process.exit(1);
});
