import { serve } from "@hono/node-server";
import { buildRouter } from "./routes.js";
import { startConsumer, disconnectConsumer } from "./kafka.js";
import { runMigrations } from "./db/migrate.js";
import { config } from "./config.js";
import { logger } from "./logger.js";

async function main() {
  // Ensure DB schema is in place
  await runMigrations();

  // Start Kafka consumer — reads from bpollo.watches.triggered
  await startConsumer();
  logger.info(
    { topic: config.kafkaTriggeredTopic },
    "llm-orchestrator Kafka consumer started",
  );

  // HTTP server — health check + sync /reason endpoint
  const router = buildRouter();
  serve({ fetch: router.fetch, port: config.port }, () => {
    logger.info({ port: config.port }, "llm-orchestrator HTTP server started");
  });

  // Graceful shutdown
  const shutdown = async () => {
    logger.info("shutting down llm-orchestrator");
    await disconnectConsumer();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  logger.error({ err }, "llm-orchestrator startup failed");
  process.exit(1);
});
