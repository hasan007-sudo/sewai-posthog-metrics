#!/usr/bin/env node

import dotenv from "dotenv";
import { Client } from "pg";

dotenv.config();

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  const dryRun = process.argv.includes("--dry-run");

  if (!dbUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  try {
    const sessionCount = await client.query(
      `SELECT COUNT(*)::int AS total FROM "Session"`,
    );

    const translatedNeedsUpdate = await client.query(`
      WITH translated_counts AS (
        SELECT
          COALESCE(re."sessionId", s.id) AS session_id,
          COUNT(*)::int AS translated_clicks_events
        FROM "RawEvent" re
        LEFT JOIN "Session" s
          ON s."roomName" = (re."properties"::jsonb ->> 'room_name')
        WHERE
          re."eventType" = 'monologue_translate_clicked'
          AND COALESCE(re."sessionId", s.id) IS NOT NULL
        GROUP BY 1
      )
      SELECT COUNT(*)::int AS total
      FROM "Session" s
      INNER JOIN translated_counts tc
        ON tc.session_id = s.id
      WHERE COALESCE(s."translatedClicksEvents", 0) <> tc.translated_clicks_events
    `);

    const orgNeedsUpdate = await client.query(`
      WITH latest_org AS (
        SELECT
          mapped.session_id,
          mapped.org_name
        FROM (
          SELECT
            COALESCE(re."sessionId", s.id) AS session_id,
            NULLIF(
              SUBSTRING(
                COALESCE(
                  re."properties"::jsonb ->> '$pathname',
                  re."properties"::jsonb ->> 'pathname',
                  re."properties"::jsonb ->> '$current_url',
                  re."properties"::jsonb ->> 'current_url',
                  re."properties"::jsonb ->> 'url',
                  ''
                )
                FROM '/org/([^/?#]+)'
              ),
              ''
            ) AS org_name,
            ROW_NUMBER() OVER (
              PARTITION BY COALESCE(re."sessionId", s.id)
              ORDER BY re."timestamp" DESC
            ) AS rn
          FROM "RawEvent" re
          LEFT JOIN "Session" s
            ON s."roomName" = (re."properties"::jsonb ->> 'room_name')
          WHERE COALESCE(re."sessionId", s.id) IS NOT NULL
        ) mapped
        WHERE mapped.rn = 1
          AND mapped.org_name IS NOT NULL
      )
      SELECT COUNT(*)::int AS total
      FROM "Session" s
      INNER JOIN latest_org lo
        ON lo.session_id = s.id
      WHERE COALESCE(s."orgName", 'unknown') <> lo.org_name
    `);

    console.info(
      `[backfill-session-derived-metrics] Sessions scanned: ${sessionCount.rows[0].total}`,
    );
    console.info(
      `[backfill-session-derived-metrics] Sessions needing translated-click update: ${translatedNeedsUpdate.rows[0].total}`,
    );
    console.info(
      `[backfill-session-derived-metrics] Sessions needing org-name update: ${orgNeedsUpdate.rows[0].total}`,
    );

    if (dryRun) {
      console.info(
        "[backfill-session-derived-metrics] Dry run enabled; no DB updates were written.",
      );
      return;
    }

    const translatedUpdateResult = await client.query(`
      WITH translated_counts AS (
        SELECT
          COALESCE(re."sessionId", s.id) AS session_id,
          COUNT(*)::int AS translated_clicks_events
        FROM "RawEvent" re
        LEFT JOIN "Session" s
          ON s."roomName" = (re."properties"::jsonb ->> 'room_name')
        WHERE
          re."eventType" = 'monologue_translate_clicked'
          AND COALESCE(re."sessionId", s.id) IS NOT NULL
        GROUP BY 1
      )
      UPDATE "Session" s
      SET "translatedClicksEvents" = tc.translated_clicks_events
      FROM translated_counts tc
      WHERE s.id = tc.session_id
        AND COALESCE(s."translatedClicksEvents", 0) <> tc.translated_clicks_events
    `);

    const orgUpdateResult = await client.query(`
      WITH latest_org AS (
        SELECT
          mapped.session_id,
          mapped.org_name
        FROM (
          SELECT
            COALESCE(re."sessionId", s.id) AS session_id,
            NULLIF(
              SUBSTRING(
                COALESCE(
                  re."properties"::jsonb ->> '$pathname',
                  re."properties"::jsonb ->> 'pathname',
                  re."properties"::jsonb ->> '$current_url',
                  re."properties"::jsonb ->> 'current_url',
                  re."properties"::jsonb ->> 'url',
                  ''
                )
                FROM '/org/([^/?#]+)'
              ),
              ''
            ) AS org_name,
            ROW_NUMBER() OVER (
              PARTITION BY COALESCE(re."sessionId", s.id)
              ORDER BY re."timestamp" DESC
            ) AS rn
          FROM "RawEvent" re
          LEFT JOIN "Session" s
            ON s."roomName" = (re."properties"::jsonb ->> 'room_name')
          WHERE COALESCE(re."sessionId", s.id) IS NOT NULL
        ) mapped
        WHERE mapped.rn = 1
          AND mapped.org_name IS NOT NULL
      )
      UPDATE "Session" s
      SET "orgName" = lo.org_name
      FROM latest_org lo
      WHERE s.id = lo.session_id
        AND COALESCE(s."orgName", 'unknown') <> lo.org_name
    `);

    console.info(
      `[backfill-session-derived-metrics] Updated translated-click rows: ${translatedUpdateResult.rowCount}`,
    );
    console.info(
      `[backfill-session-derived-metrics] Updated org-name rows: ${orgUpdateResult.rowCount}`,
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("[backfill-session-derived-metrics] Failed:", error);
  process.exit(1);
});
