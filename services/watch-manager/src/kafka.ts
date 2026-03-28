import { Kafka } from "kafkajs"
import { BpolloEventSchema } from "@bpollo/schemas"
import { config } from "./config.js"
import { matchAndTrigger } from "./matcher.js"
import { logger } from "./logger.js"

const kafka    = new Kafka({ clientId: "watch-manager", brokers: config.kafkaBrokers })
const consumer = kafka.consumer({ groupId: config.consumerGroup })

export async function startConsumer(): Promise<void> {
  await consumer.connect()
  await consumer.subscribe({ topic: config.kafkaTopic, fromBeginning: false })

  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return

      let parsed: unknown
      try { parsed = JSON.parse(message.value.toString()) } catch {
        logger.warn("non-JSON message on watch topic, skipping")
        return
      }

      const result = BpolloEventSchema.safeParse(parsed)
      if (!result.success) {
        logger.warn({ issues: result.error.issues }, "invalid event on watch topic, skipping")
        return
      }

      const matches = await matchAndTrigger(result.data)
      if (matches.length > 0) {
        logger.info({ count: matches.length, eventId: result.data.event_id }, "watches triggered")
      }
    },
  })
}

export async function disconnectConsumer(): Promise<void> {
  await consumer.disconnect()
}
