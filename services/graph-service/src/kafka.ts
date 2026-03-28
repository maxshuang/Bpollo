import { Kafka } from "kafkajs";
import { BpolloEventSchema } from "@bpollo/schemas";
import { config } from "./config.js";
import { applyEvent } from "./state.js";
import type { GraphIndex } from "./graph/types.js";
import { logger } from "./logger.js";

const kafka = new Kafka({
  clientId: "graph-service",
  brokers: config.kafkaBrokers,
});

const consumer = kafka.consumer({ groupId: config.consumerGroup });

export async function startConsumer(index: GraphIndex) {
  await consumer.connect();
  await consumer.subscribe({ topic: config.kafkaTopic, fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return;

      let parsed: unknown;
      try {
        parsed = JSON.parse(message.value.toString());
      } catch {
        logger.warn("non-JSON message on graph topic, skipping");
        return;
      }

      const result = BpolloEventSchema.safeParse(parsed);
      if (!result.success) {
        logger.warn(
          { issues: result.error.issues },
          "invalid event on graph topic, skipping",
        );
        return;
      }

      await applyEvent(result.data, index);
    },
  });
}

export async function disconnectConsumer() {
  await consumer.disconnect();
}
