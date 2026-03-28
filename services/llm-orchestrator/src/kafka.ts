import { Kafka } from "kafkajs";
import { WatchTriggerSchema } from "@bpollo/schemas";
import { config } from "./config.js";
import { runReasoningCycle } from "./agent.js";
import { logger } from "./logger.js";

const kafka = new Kafka({
  clientId: "llm-orchestrator",
  brokers: config.kafkaBrokers,
});

const consumer = kafka.consumer({ groupId: config.consumerGroup });

export async function startConsumer(): Promise<void> {
  await consumer.connect();
  await consumer.subscribe({
    topic: config.kafkaTriggeredTopic,
    fromBeginning: false,
  });

  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return;

      let raw: unknown;
      try {
        raw = JSON.parse(message.value.toString());
      } catch {
        logger.warn("non-JSON message on triggered topic, skipping");
        return;
      }

      const parsed = WatchTriggerSchema.safeParse(raw);
      if (!parsed.success) {
        logger.warn(
          { issues: parsed.error.issues },
          "invalid WatchTrigger message, skipping",
        );
        return;
      }

      const trigger = parsed.data;

      logger.info(
        { watchId: trigger.watch_id, triggerType: trigger.trigger_type },
        "watch trigger received — starting reasoning cycle",
      );

      // Reasoning cycles run sequentially per Kafka partition (per entity_id)
      // so we don't need to worry about concurrent cycles for the same entity.
      await runReasoningCycle(trigger);
    },
  });
}

export async function disconnectConsumer(): Promise<void> {
  await consumer.disconnect();
}
