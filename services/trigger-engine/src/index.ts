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

  await startConsumer();
  logger.info("kafka consumer started");

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
