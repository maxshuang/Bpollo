import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { connectProducer, disconnectProducer } from "./kafka.js";
import { disconnectRedis } from "./dedup.js";
import { ingestRouter } from "./ingest.js";
import { config } from "./config.js";
import { logger } from "./logger.js";

const app = new Hono();
app.route("/", ingestRouter);

async function main() {
  await connectProducer();
  logger.info("kafka producer connected");

  const server = serve({ fetch: app.fetch, port: config.port });
  logger.info({ port: config.port }, "event-ingestion service started");

  const shutdown = async () => {
    logger.info("shutting down...");
    await disconnectProducer();
    await disconnectRedis();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  logger.error(err, "failed to start");
  process.exit(1);
});
