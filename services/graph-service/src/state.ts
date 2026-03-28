import { eq, and } from "drizzle-orm"
import { db } from "./db/client.js"
import { entityState, entityHistory } from "./db/schema.js"
import type { GraphIndex } from "./graph/types.js"
import type { BpolloEvent } from "@bpollo/schemas"
import { logger } from "./logger.js"

export async function applyEvent(event: BpolloEvent, index: GraphIndex): Promise<void> {
  const node = index.byEventType.get(event.event_type)
  if (!node) {
    logger.debug({ event_type: event.event_type }, "no graph node for event type, skipping")
    return
  }

  const now = new Date(event.timestamp)

  // Get current state to record the transition from-node
  const [current] = await db
    .select()
    .from(entityState)
    .where(and(
      eq(entityState.entityId, event.entity_id),
      eq(entityState.tenantId, event.tenant_id),
    ))

  const fromNode = current?.currentNode ?? null

  // Upsert entity state
  await db
    .insert(entityState)
    .values({
      entityId:    event.entity_id,
      tenantId:    event.tenant_id,
      currentNode: node.id,
      enteredAt:   now,
      updatedAt:   now,
    })
    .onConflictDoUpdate({
      target: [entityState.entityId, entityState.tenantId],
      set: {
        currentNode: node.id,
        enteredAt:   now,
        updatedAt:   now,
      },
    })

  // Append history
  await db.insert(entityHistory).values({
    entityId:   event.entity_id,
    tenantId:   event.tenant_id,
    fromNode,
    toNode:     node.id,
    eventId:    event.event_id,
    eventType:  event.event_type,
    occurredAt: now,
  })

  logger.info(
    { entity_id: event.entity_id, from: fromNode, to: node.id, event_id: event.event_id },
    "entity state updated"
  )
}
