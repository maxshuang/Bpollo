import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { runMigrations } from "./db/migrate.js";
import { buildRouter } from "./routes.js";

async function main() {
  await runMigrations();
  logger.info("migrations complete");

  const app = new Hono();
  app.route("/", buildRouter());

  serve({ fetch: app.fetch, port: config.port }, () => {
    logger.info({ port: config.port }, "alert-service listening");
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
