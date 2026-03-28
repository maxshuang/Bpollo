import { Hono } from "hono";
import { BpolloEventSchema } from "@bpollo/schemas";
import { producer } from "./kafka.js";
import { isDuplicate } from "./dedup.js";
import { config } from "./config.js";
import { logger } from "./logger.js";

export const ingestRouter = new Hono();

ingestRouter.post("/ingest/webhook", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid JSON" }, 400);
  }

  // Validate and parse — rejects unknown event types
  const result = BpolloEventSchema.safeParse(body);
  if (!result.success) {
    logger.warn({ issues: result.error.issues }, "event validation failed");
    return c.json(
      { error: "validation failed", issues: result.error.issues },
      422,
    );
  }

  const event = result.data;

  // Deduplicate
  if (await isDuplicate(event.event_id)) {
    logger.info({ event_id: event.event_id }, "duplicate event dropped");
    return c.json({ status: "duplicate" }, 200);
  }

  // Publish to Kafka
  await producer.send({
    topic: config.kafkaTopic,
    messages: [
      {
        key: event.entity_id,
        value: JSON.stringify(event),
      },
    ],
  });

  logger.info(
    { event_id: event.event_id, event_type: event.event_type },
    "event ingested",
  );
  return c.json({ status: "accepted", event_id: event.event_id }, 202);
});

ingestRouter.get("/health", (c) => c.json({ status: "ok" }));
