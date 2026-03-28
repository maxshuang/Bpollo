import { connect, disconnect } from "./kafka.js"
import { startRouter } from "./router.js"
import { logger } from "./logger.js"

async function main() {
  await connect()
  logger.info("kafka connected")

  await startRouter()
  logger.info("event-router running")

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
