import { Prisma, PrismaClient } from "@/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

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
    const sslModeMissing = !parsed.searchParams.has("sslmode");
    if (sslModeMissing) {
      parsed.searchParams.set("sslmode", "require");
    }
    if (!parsed.searchParams.has("channel_binding")) {
      parsed.searchParams.set("channel_binding", "require");
    }
    return {
      connectionString: parsed.toString(),
      sslModeAutoApplied: sslModeMissing,
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
  const adapter = new PrismaNeon({ connectionString });
  return new PrismaClient({ adapter });
}

function isTransientSewaiConnectionError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P1017") {
      return true;
    }

    if (error.code === "P2010") {
      const message = String(error.meta?.message ?? "").toLowerCase();
      return (
        message.includes("server has closed the connection") ||
        message.includes("connection terminated unexpectedly") ||
        message.includes("econnreset")
      );
    }
  }

  if (
    error instanceof Prisma.PrismaClientUnknownRequestError ||
    error instanceof Prisma.PrismaClientInitializationError
  ) {
    const message = error.message.toLowerCase();
    return (
      message.includes("server has closed the connection") ||
      message.includes("connection terminated unexpectedly") ||
      message.includes("econnreset")
    );
  }

  return false;
}

async function resetSewaiPrismaClient() {
  const currentClient = globalForSewaiPrisma.sewaiPrisma;
  globalForSewaiPrisma.sewaiPrisma = undefined;
  if (!currentClient) {
    return;
  }

  await currentClient.$disconnect().catch(() => undefined);
}

export function getSewaiPrismaClient(): PrismaClient | null {
  const sewaiDbUrl =
    process.env.SEWAI_DIRECT_URL ?? process.env.SEWAI_DATABASE_URL;
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

  const retries = 2;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
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
      const canRetry =
        attempt < retries && isTransientSewaiConnectionError(error);
      if (!canRetry) {
        console.warn(
          "[sewai-prisma] Failed to fetch activity metadata from SEWAI DB.",
          error,
        );
        return new Map();
      }

      console.warn(
        `[sewai-prisma] Transient connection error while fetching activity metadata. Retrying (${attempt + 1}/${retries}).`,
        error,
      );
      await resetSewaiPrismaClient();
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }

  return new Map();
}
