import { Prisma, PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

interface SewaiActivityMetadataRow {
  activity_id: string;
  configured_question_count: number;
  topic_name: string | null;
}

export interface SewaiActivityMetadata {
  topicName: string;
  configuredQuestionCount: number;
}

const globalForSewaiPrisma = globalThis as unknown as {
  sewaiPrisma: PrismaClient | undefined;
  sewaiSslModeAutoApplied: boolean | undefined;
  sewaiSslModeLogEmitted: boolean | undefined;
};

function buildSewaiDbUrlWithSslMode(rawUrl: string): {
  connectionString: string;
  sslModeAutoApplied: boolean;
} {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.searchParams.has("sslmode")) {
      return {
        connectionString: parsed.toString(),
        sslModeAutoApplied: false,
      };
    }

    parsed.searchParams.set("sslmode", "require");
    return {
      connectionString: parsed.toString(),
      sslModeAutoApplied: true,
    };
  } catch (error) {
    console.warn(
      "[sewai-prisma] Invalid SEWAI_DATABASE_URL format. Using raw URL without sslmode normalization.",
      error,
    );
    return {
      connectionString: rawUrl,
      sslModeAutoApplied: false,
    };
  }
}

function createSewaiPrismaClient(connectionString: string) {
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

export function getSewaiPrismaClient(): PrismaClient | null {
  const sewaiDbUrl = process.env.SEWAI_DATABASE_URL;
  if (!sewaiDbUrl) {
    return null;
  }

  const { connectionString, sslModeAutoApplied } =
    buildSewaiDbUrlWithSslMode(sewaiDbUrl);

  if (!globalForSewaiPrisma.sewaiPrisma) {
    globalForSewaiPrisma.sewaiPrisma =
      createSewaiPrismaClient(connectionString);
    globalForSewaiPrisma.sewaiSslModeAutoApplied = sslModeAutoApplied;
  }

  if (
    globalForSewaiPrisma.sewaiSslModeAutoApplied &&
    !globalForSewaiPrisma.sewaiSslModeLogEmitted
  ) {
    console.info(
      "[sewai-prisma] Auto-applied sslmode=require for SEWAI database connection.",
    );
    globalForSewaiPrisma.sewaiSslModeLogEmitted = true;
  }

  return globalForSewaiPrisma.sewaiPrisma;
}

export async function fetchSewaiActivityMetadata(
  activityIds: string[],
): Promise<Map<string, SewaiActivityMetadata>> {
  const uniqueActivityIds = Array.from(
    new Set(activityIds.filter((activityId) => activityId.length > 0)),
  );

  if (uniqueActivityIds.length === 0) {
    return new Map();
  }

  const sewaiPrisma = getSewaiPrismaClient();
  if (!sewaiPrisma) {
    return new Map();
  }

  try {
    const rows = await sewaiPrisma.$queryRaw<SewaiActivityMetadataRow[]>(
      Prisma.sql`
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
          )::int AS configured_question_count,
          array_to_string(array_agg(DISTINCT t.name ORDER BY t.name), ', ') AS topic_name
        FROM activities a
        LEFT JOIN topic_activities ta
          ON ta."activityId" = a.id
        LEFT JOIN topics t
          ON t.id = ta."topicId"
          AND COALESCE(t."isDeleted", false) = false
        WHERE a.id IN (${Prisma.join(uniqueActivityIds)})
        GROUP BY a.id
      `,
    );

    return new Map(
      rows.map((row) => [
        row.activity_id,
        {
          topicName: row.topic_name ?? "-",
          configuredQuestionCount: row.configured_question_count ?? 0,
        },
      ]),
    );
  } catch (error) {
    console.warn(
      "[sewai-prisma] Failed to fetch activity metadata from SEWAI DB.",
      error,
    );
    return new Map();
  }
}
