import { Kafka } from "kafkajs";
import {
  BpolloEventSchema,
  type GraphLocation,
  type WatchCreationRequest,
} from "@bpollo/schemas";
import { config } from "./config.js";
import { registry } from "./registry.js";
import { logger } from "./logger.js";

const kafka = new Kafka({
  clientId: "trigger-engine",
  brokers: config.kafkaBrokers,
});
const consumer = kafka.consumer({ groupId: config.consumerGroup });

// ---------------------------------------------------------------------------
// Graph Service client
// ---------------------------------------------------------------------------

async function locateInGraph(event: unknown): Promise<GraphLocation | null> {
  try {
    const res = await fetch(`${config.graphServiceUrl}/graph/locate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event }),
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, "graph/locate returned non-OK");
      return null;
    }
    return (await res.json()) as GraphLocation;
  } catch (err) {
    logger.warn({ err }, "graph/locate call failed");
    return null;
  }
}

// ---------------------------------------------------------------------------
// Watch Manager client
// ---------------------------------------------------------------------------

async function createWatch(req: WatchCreationRequest): Promise<void> {
  try {
    const res = await fetch(`${config.watchManagerUrl}/watches`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, "POST /watches returned non-OK");
    }
  } catch (err) {
    logger.warn({ err }, "POST /watches call failed");
  }
}

// ---------------------------------------------------------------------------
// Consumer
// ---------------------------------------------------------------------------

export async function startConsumer(): Promise<void> {
  await consumer.connect();
  await consumer.subscribe({ topic: config.kafkaTopic, fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return;

      let raw: unknown;
      try {
        raw = JSON.parse(message.value.toString());
      } catch {
        logger.warn("non-JSON message on pattern topic, skipping");
        return;
      }

      const parsed = BpolloEventSchema.safeParse(raw);
      if (!parsed.success) {
        logger.warn(
          { issues: parsed.error.issues },
          "invalid event on pattern topic, skipping",
        );
        return;
      }

      const event = parsed.data;

      // Step 1: get graph location for this event
      const graphLocation = await locateInGraph(event);
      if (!graphLocation) {
        logger.warn(
          { eventId: event.event_id },
          "could not locate event in graph, skipping triggers",
        );
        return;
      }

      // Step 2: run all triggers
      const results = await registry.evaluate(event, graphLocation);

      // Step 3: create a watch for each trigger that fired
      for (const result of results) {
        if (!result.watch_creation_request) continue;

        await createWatch(result.watch_creation_request);

        logger.info(
          {
            trigger: result.trigger_name,
            entityId: event.entity_id,
            eventId: event.event_id,
          },
          "watch created from trigger",
        );
      }
    },
  });
}

export async function disconnectConsumer(): Promise<void> {
  await consumer.disconnect();
}
