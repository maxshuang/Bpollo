/**
 * Run at service startup to ensure tables exist.
 * For production, use drizzle-kit migrate with proper migration files.
 * This inline approach is fine for MVP.
 */
import { db } from "./client.js"
import { sql } from "drizzle-orm"

export async function runMigrations() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS entity_state (
      entity_id    TEXT        NOT NULL,
      tenant_id    TEXT        NOT NULL,
      current_node TEXT        NOT NULL,
      entered_at   TIMESTAMPTZ NOT NULL,
      updated_at   TIMESTAMPTZ NOT NULL,
      PRIMARY KEY (entity_id, tenant_id)
    )
  `)

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS entity_history (
      id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      entity_id   TEXT        NOT NULL,
      tenant_id   TEXT        NOT NULL,
      from_node   TEXT,
      to_node     TEXT        NOT NULL,
      event_id    TEXT        NOT NULL,
      event_type  TEXT        NOT NULL,
      occurred_at TIMESTAMPTZ NOT NULL
    )
  `)

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_entity_history_entity
      ON entity_history (entity_id, tenant_id, occurred_at DESC)
  `)
}
