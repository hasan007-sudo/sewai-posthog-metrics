import { Prisma, PrismaClient } from "@/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function buildConnectionString(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    if (!parsed.searchParams.has("sslmode")) {
      parsed.searchParams.set("sslmode", "require");
    }
    if (!parsed.searchParams.has("connect_timeout")) {
      parsed.searchParams.set("connect_timeout", "15");
    }
    return parsed.toString();
  } catch {
    return rawUrl;
  }
}

function createPrismaClient(connectionString: string) {
  const adapter = new PrismaNeon({ connectionString });
  return new PrismaClient({ adapter });
}

export function isRetryableConnectionError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybeError = error as { code?: unknown; message?: unknown; meta?: unknown };
  
  if (maybeError.code === "P1017") {
    return true;
  }

  if (maybeError.code === "P2010") {
    const message = typeof maybeError.message === "string" ? maybeError.message : "";
    const metaText =
      maybeError.meta && typeof maybeError.meta === "object"
        ? JSON.stringify(maybeError.meta)
        : "";
    const combined = `${message} ${metaText}`.toLowerCase();
    return (
      combined.includes("server has closed the connection") ||
      combined.includes("connection terminated") ||
      combined.includes("econnreset")
    );
  }

  if (
    error instanceof Prisma.PrismaClientUnknownRequestError ||
    error instanceof Prisma.PrismaClientInitializationError
  ) {
    const message = error.message.toLowerCase();
    return (
      message.includes("server has closed the connection") ||
      message.includes("connection terminated") ||
      message.includes("econnreset")
    );
  }

  return false;
}

export async function resetPrismaClient() {
  const currentClient = globalForPrisma.prisma;
  globalForPrisma.prisma = undefined;
  if (currentClient) {
    await currentClient.$disconnect().catch(() => undefined);
  }
}

export async function withTransientRetry<T>(
  operation: (client: PrismaClient) => Promise<T>,
  retries = 2,
): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const client = globalForPrisma.prisma ?? createPrismaClient(
      buildConnectionString(process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "")
    );
    
    try {
      return await operation(client);
    } catch (error) {
      const canRetry = attempt < retries && isRetryableConnectionError(error);
      if (!canRetry) {
        throw error;
      }

      console.warn(
        `[prisma] Transient connection error. Retrying (${attempt + 1}/${retries}).`,
        error,
      );
      await resetPrismaClient();
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }

  throw new Error("Unreachable retry loop state");
}

function ensurePrismaClient() {
  if (!globalForPrisma.prisma) {
    const rawUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
    if (!rawUrl) {
      throw new Error("DIRECT_URL or DATABASE_URL is required");
    }
    globalForPrisma.prisma = createPrismaClient(buildConnectionString(rawUrl));
  }
}

export function getPrismaClient(): PrismaClient {
  ensurePrismaClient();
  return globalForPrisma.prisma as PrismaClient;
}

export const prisma = getPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
