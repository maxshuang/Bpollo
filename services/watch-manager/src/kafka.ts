import { Kafka } from "kafkajs";
import { BpolloEventSchema, type WatchObject } from "@bpollo/schemas";
import { config } from "./config.js";
import { matchAndTrigger } from "./matcher.js";
import { logger } from "./logger.js";

const kafka = new Kafka({
  clientId: "watch-manager",
  brokers: config.kafkaBrokers,
});
const consumer = kafka.consumer({ groupId: config.consumerGroup });
const producer = kafka.producer();

export async function startProducer(): Promise<void> {
  await producer.connect();
}

export async function publishTriggered(
  watchId: string,
  entityId: string,
  tenantId: string,
  triggerType: "event_match" | "absence",
  watchSnapshot: WatchObject,
  triggeredAt: Date,
): Promise<void> {
  await producer.send({
    topic: config.kafkaTriggeredTopic,
    messages: [
      {
        key: entityId,
        value: JSON.stringify({
          watch_id: watchId,
          entity_id: entityId,
          tenant_id: tenantId,
          trigger_type: triggerType,
          triggered_at: triggeredAt.toISOString(),
          watch_snapshot: watchSnapshot,
        }),
      },
    ],
  });
}

export async function startConsumer(): Promise<void> {
  await consumer.connect();
  await consumer.subscribe({ topic: config.kafkaTopic, fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return;

      let parsed: unknown;
      try {
        parsed = JSON.parse(message.value.toString());
      } catch {
        logger.warn("non-JSON message on watch topic, skipping");
        return;
      }

      const result = BpolloEventSchema.safeParse(parsed);
      if (!result.success) {
        logger.warn(
          { issues: result.error.issues },
          "invalid event on watch topic, skipping",
        );
        return;
      }

      const matches = await matchAndTrigger(result.data);
      for (const match of matches) {
        await publishTriggered(
          match.watchId,
          match.entityId,
          match.tenantId,
          "event_match",
          match.watchSnapshot,
          match.triggeredAt,
        );
        logger.info(
          { watchId: match.watchId, eventId: result.data.event_id },
          "watch triggered — published to run queue",
        );
      }
    },
  });
}

export async function disconnectConsumer(): Promise<void> {
  await consumer.disconnect();
  await producer.disconnect();
}
