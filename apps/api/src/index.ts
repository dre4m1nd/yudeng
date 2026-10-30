import { buildApp } from "./app";
import { config } from "./config";
import { prisma } from "./db";
import { startScheduler } from "./scheduler";

async function main() {
  const app = await buildApp();

  await app.listen({ port: config.PORT, host: config.HOST });
  startScheduler();

  app.log.info(`yudeng 余灯 listening on http://${config.HOST}:${config.PORT}`);

  const shutdown = async () => {
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});