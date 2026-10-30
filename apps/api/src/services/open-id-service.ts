import type { UtilityType } from "@yudeng/shared";
import { decryptOpenId } from "../crypto";
import { prisma } from "../db";
import { ProviderError } from "../errors";
import { fetchForUtility, type MeterReading } from "./school-provider";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function getOpenIdRecord(dormId: string) {
  return prisma.dormToken.findFirst({
    where: { dormId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
}

async function markUsed(recordId: string) {
  await prisma.dormToken.update({
    where: { id: recordId },
    data: { lastUsedAt: new Date() },
  });
}

async function markSuccess(recordId: string) {
  await prisma.dormToken.update({
    where: { id: recordId },
    data: {
      status: "ACTIVE",
      failureCount: 0,
      lastSuccessAt: new Date(),
      cooldownUntil: null,
      lastError: null,
    },
  });
}

async function markAuthFailure(recordId: string, message: string) {
  await prisma.dormToken.update({
    where: { id: recordId },
    data: {
      status: "INVALID",
      failureCount: { increment: 1 },
      cooldownUntil: null,
      lastError: message.slice(0, 500),
    },
  });
}

async function markRateLimit(
  recordId: string,
  message: string,
  retryAfterMs?: number,
) {
  const cooldownMs = Math.max(retryAfterMs ?? 60 * 60 * 1000, 60 * 1000);
  await prisma.dormToken.update({
    where: { id: recordId },
    data: {
      status: "COOLING",
      failureCount: { increment: 1 },
      cooldownUntil: new Date(Date.now() + cooldownMs),
      lastError: message.slice(0, 500),
    },
  });
}

async function markTransientFailure(recordId: string, message: string) {
  const record = await prisma.dormToken.update({
    where: { id: recordId },
    data: {
      failureCount: { increment: 1 },
      lastError: message.slice(0, 500),
    },
  });

  if (record.failureCount >= 3) {
    await prisma.dormToken.update({
      where: { id: recordId },
      data: {
        status: "COOLING",
        cooldownUntil: new Date(Date.now() + 10 * 60 * 1000),
      },
    });
  }
}

export async function fetchWithOpenId(
  dormId: string,
  utility: UtilityType,
): Promise<MeterReading> {
  const record = await getOpenIdRecord(dormId);

  if (!record) {
    throw new ProviderError("No OpenID configured", "auth");
  }

  await markUsed(record.id);

  let openId: string;
  try {
    openId = decryptOpenId(record.tokenCipher);
  } catch {
    await markAuthFailure(record.id, "OpenID decryption failed");
    throw new ProviderError("OpenID decryption failed", "auth");
  }

  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const reading = await fetchForUtility(openId, utility);
      await markSuccess(record.id);
      return reading;
    } catch (error) {
      lastError = error;

      if (error instanceof ProviderError) {
        if (error.kind === "auth") {
          await markAuthFailure(record.id, error.message);
          break;
        }

        if (error.kind === "rate_limit") {
          await markRateLimit(record.id, error.message, error.retryAfterMs);
          break;
        }

        if (error.kind === "api" || error.kind === "parse") {
          await markTransientFailure(record.id, error.message);
          break;
        }

        if (error.kind === "transient") {
          if (attempt < 2) {
            await sleep(400 * 2 ** attempt);
            continue;
          }
          await markTransientFailure(record.id, error.message);
          break;
        }
      }

      if (attempt < 2) {
        await sleep(400 * 2 ** attempt);
        continue;
      }

      await markTransientFailure(
        record.id,
        error instanceof Error ? error.message : String(error),
      );
      break;
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }

  throw new ProviderError("OpenID request failed", "auth");
}
