import { serve } from "@hono/node-server"
import { Hono } from "hono"
import { connect, disconnect } from "./kafka.js"
import { startRouter } from "./router.js"
import { config } from "./config.js"
import { logger } from "./logger.js"

async function main() {
  await connect()
  logger.info("kafka connected")

  await startRouter()
  logger.info("event-router running")

  // Minimal HTTP server — health check only, used by tests and orchestration
  const app = new Hono()
  app.get("/health", (c) => c.json({ status: "ok" }))
  serve({ fetch: app.fetch, port: config.healthPort })
  logger.info({ port: config.healthPort }, "health endpoint listening")

  const shutdown = async () => {
    logger.info("shutting down...")
    await disconnect()
    process.exit(0)
  }

  process.on("SIGTERM", shutdown)
  process.on("SIGINT", shutdown)
}

main().catch((err) => {
  logger.error(err, "failed to start")
  process.exit(1)
})
