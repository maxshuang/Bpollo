import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { buildRouter } from "./routes.js";
import { startConsumer, disconnectConsumer } from "./kafka.js";

async function main() {
  const app = new Hono();
  app.route("/", buildRouter());

  const server = serve({ fetch: app.fetch, port: config.port }, () => {
    logger.info({ port: config.port }, "trigger-engine listening");
  });

  // Start Kafka consumer in the background — does not block HTTP startup
  // so the service is healthy even if Kafka is temporarily unavailable.
  startConsumer()
    .then(() => logger.info("kafka consumer started"))
    .catch((err) => logger.error({ err }, "kafka consumer failed to start"));

  const shutdown = async () => {
    logger.info("shutting down");
    await disconnectConsumer();
    server.close();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
