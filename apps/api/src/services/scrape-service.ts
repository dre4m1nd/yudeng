import type { UtilityType } from "@yudeng/shared";
import { prisma } from "../db";
import { evaluateAlerts, sendSystemAlert } from "./alert-engine";
import { fetchWithOpenId } from "./open-id-service";

const runningDorms = new Set<string>();

function startOfHour(date: Date): Date {
  return new Date(Math.floor(date.getTime() / (60 * 60 * 1000)) * 60 * 60 * 1000);
}

export type ScrapeResult = {
  skipped?: boolean;
  reason?: string;
  runId?: string;
  status?: string;
  successCount?: number;
  failedCount?: number;
  errors?: string[];
};

export async function runScrape(
  dormId: string,
  trigger: "cron" | "manual",
): Promise<ScrapeResult> {
  if (runningDorms.has(dormId)) {
    return { skipped: true, reason: "A scrape is already running" };
  }

  runningDorms.add(dormId);
  const startedAt = new Date();
  const run = await prisma.scrapeRun.create({
    data: { dormId, trigger, status: "RUNNING" },
  });

  const errors: string[] = [];
  let successCount = 0;
  let failedCount = 0;

  try {
    const accounts = await prisma.utilityAccount.findMany({ where: { dormId } });
    const hourBucket = startOfHour(startedAt);

    for (const account of accounts) {
      try {
        const reading = await fetchWithOpenId(dormId, account.type as UtilityType);

        await prisma.balanceSnapshot.upsert({
          where: {
            accountId_hourBucket: { accountId: account.id, hourBucket },
          },
          create: {
            accountId: account.id,
            moneyCents: reading.moneyCents,
            volumeHundredths: reading.volumeHundredths,
            schoolUpdatedAt: reading.schoolUpdatedAt,
            capturedAt: new Date(),
            hourBucket,
            raw: JSON.stringify(reading.raw),
          },
          update: {
            moneyCents: reading.moneyCents,
            volumeHundredths: reading.volumeHundredths,
            schoolUpdatedAt: reading.schoolUpdatedAt,
            capturedAt: new Date(),
            raw: JSON.stringify(reading.raw),
          },
        });

        successCount += 1;
      } catch (error) {
        failedCount += 1;
        errors.push(
          `${account.displayName}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    const status =
      failedCount === 0 ? "SUCCESS" : successCount > 0 ? "PARTIAL" : "FAILED";

    await prisma.scrapeRun.update({
      where: { id: run.id },
      data: {
        status,
        finishedAt: new Date(),
        durationMs: Date.now() - startedAt.getTime(),
        error: errors.join(" | ").slice(0, 2000) || null,
      },
    });

    try {
      await evaluateAlerts(dormId);
    } catch (error) {
      console.error("Alert evaluation failed:", error);
    }

    if (status !== "SUCCESS") {
      const openIdInvalid = errors.some(
        (message) =>
          message.includes("No OpenID configured") ||
          message.includes("OpenID decryption failed") ||
          message.includes("HTTP 401") ||
          message.includes("HTTP 403"),
      );

      await sendSystemAlert(
        dormId,
        openIdInvalid ? "TOKEN_INVALID" : "SCRAPE_FAILED",
        errors.join("\n"),
      );
    }

    return {
      runId: run.id,
      status,
      successCount,
      failedCount,
      errors,
    };
  } catch (error) {
    await prisma.scrapeRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        durationMs: Date.now() - startedAt.getTime(),
        error: error instanceof Error ? error.message : String(error),
      },
    });

    try {
      await sendSystemAlert(
        dormId,
        "SCRAPE_FAILED",
        error instanceof Error ? error.message : String(error),
      );
    } catch {
      // Scrape result is still recorded if the alert cannot be sent.
    }

    throw error;
  } finally {
    runningDorms.delete(dormId);
  }
}
