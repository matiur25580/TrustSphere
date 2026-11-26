import { createApp } from "./app.js";
import { connectDatabase, disconnectDatabase } from "./config/database.js";
import { env } from "./config/env.js";

async function start() {
  await connectDatabase();

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    console.info(`TrustSphere API listening on port ${env.PORT}`);
  });

  const shutdown = async (signal: string) => {
    console.info(`${signal} received; shutting down gracefully`);
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

start().catch((error: unknown) => {
  console.error("Failed to start TrustSphere API:", error);
  process.exit(1);
});
