import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { loadGraph } from "./graph/loader.js";
import { runMigrations } from "./db/migrate.js";
import { buildRouter } from "./routes.js";
import { startConsumer, disconnectConsumer } from "./kafka.js";

async function main() {
  // DB
  await runMigrations();
  logger.info("db migrations applied");

  // Global graph
  const { graph, index } = loadGraph(config.graphYamlPath);
  logger.info({ nodes: graph.nodes.length }, "global graph loaded");

  // HTTP
  const app = new Hono();
  app.route("/", buildRouter(graph, index));

  const server = serve({ fetch: app.fetch, port: config.port });
  logger.info({ port: config.port }, "graph-service started");

  // Kafka
  await startConsumer(index);
  logger.info("kafka consumer running");

  const shutdown = async () => {
    logger.info("shutting down...");
    await disconnectConsumer();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  logger.error(err, "failed to start");
  process.exit(1);
});
