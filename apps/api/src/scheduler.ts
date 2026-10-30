import cron from "node-cron";
import { prisma } from "./db";
import { runScrape } from "./services/scrape-service";

export function startScheduler() {
  const task = cron.schedule(
    "5 * * * *",
    async () => {
      const dorms = await prisma.dorm.findMany({
        select: { id: true, name: true },
        orderBy: { createdAt: "asc" },
      });

      if (dorms.length === 0) {
        console.warn("Scheduler: no dorm configured, skipping scrape");
        return;
      }

      for (const dorm of dorms) {
        try {
          const result = await runScrape(dorm.id, "cron");
          console.log(
            `Hourly scrape finished for ${dorm.name}:`,
            result.status ?? "skipped",
          );
        } catch (error) {
          console.error(`Hourly scrape failed for ${dorm.name}:`, error);
        }
      }
    },
    { timezone: "Asia/Shanghai" },
  );

  console.log("Scheduler started: 5 * * * * Asia/Shanghai");
  return task;
}