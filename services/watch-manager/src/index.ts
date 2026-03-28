import { serve } from "@hono/node-server"
import { Hono } from "hono"
import { config } from "./config.js"
import { logger } from "./logger.js"
import { runMigrations } from "./db/migrate.js"
import { redis } from "./redis.js"
import { startConsumer, disconnectConsumer } from "./kafka.js"
import { buildRouter } from "./routes.js"

async function main() {
  await runMigrations()
  logger.info("migrations complete")

  await redis.connect()
  logger.info("redis connected")

  const app = new Hono()
  app.route("/", buildRouter())

  const server = serve({ fetch: app.fetch, port: config.port }, () => {
    logger.info({ port: config.port }, "watch-manager listening")
  })

  await startConsumer()
  logger.info("kafka consumer started")

  const shutdown = async () => {
    logger.info("shutting down")
    await disconnectConsumer()
    redis.disconnect()
    server.close()
    process.exit(0)
  }

  process.on("SIGTERM", shutdown)
  process.on("SIGINT",  shutdown)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
