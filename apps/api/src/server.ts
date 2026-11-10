import { buildApp } from "./app";
import { prisma } from "./db";
import { startSweep, stopSweep } from "./domain/sweep";
import { env } from "./env";
import { hub } from "./hub";
import { reloadCategories } from "./jev";

const app = await buildApp();
await reloadCategories();
hub.start();
startSweep();
await app.listen({ port: env.PORT, host: env.HOST });

const shutdown = async () => {
  stopSweep();
  hub.stop();
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
