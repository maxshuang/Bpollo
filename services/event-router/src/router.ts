import { BpolloEventSchema } from "@bpollo/schemas"
import { producer, consumer } from "./kafka.js"
import { config } from "./config.js"
import { logger } from "./logger.js"

/**
 * Fan-out strategy:
 *
 *   bpollo.events.raw  ──►  bpollo.events.graph    (Graph Service: locate + update personal graph)
 *                      ──►  bpollo.events.pattern   (Trigger Engine: pattern + rule evaluation)
 *                      ──►  bpollo.events.watch     (Watch Manager: two-stage watch matching)
 *
 * All three topics receive every event. Each downstream service filters by event_type as needed.
 * Partition key is entity_id to preserve per-entity ordering across all topics.
 */
export async function startRouter() {
  await consumer.subscribe({ topic: config.inboundTopic, fromBeginning: false })

  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return

      const raw = message.value.toString()

      let parsed: unknown
      try {
        parsed = JSON.parse(raw)
      } catch {
        logger.warn("received non-JSON message, skipping")
        return
      }

      const result = BpolloEventSchema.safeParse(parsed)
      if (!result.success) {
        logger.warn({ issues: result.error.issues }, "invalid event on raw topic, skipping")
        return
      }

      const event = result.data
      const key   = event.entity_id

      await producer.send({
        topic:    config.graphTopic,
        messages: [{ key, value: raw }],
      })

      await producer.send({
        topic:    config.patternTopic,
        messages: [{ key, value: raw }],
      })

      await producer.send({
        topic:    config.watchTopic,
        messages: [{ key, value: raw }],
      })

      logger.info(
        { event_id: event.event_id, event_type: event.event_type, entity_id: event.entity_id },
        "event fanned out"
      )
    },
  })
}
