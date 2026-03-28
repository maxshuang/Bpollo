import { db } from "./client.js";
import { sql } from "drizzle-orm";

export async function runMigrations() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS watch_objects (
      watch_id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      entity_id           TEXT        NOT NULL,
      tenant_id           TEXT        NOT NULL,
      status              TEXT        NOT NULL DEFAULT 'waiting',
      risk_level          TEXT        NOT NULL,
      scope               TEXT        NOT NULL DEFAULT 'entity',
      reason              TEXT        NOT NULL,
      graph_snapshot      JSONB       NOT NULL,
      trigger_conditions  JSONB       NOT NULL,
      expected_signals    JSONB       NOT NULL,
      history             JSONB       NOT NULL DEFAULT '[]',
      created_at          TIMESTAMPTZ NOT NULL,
      expires_at          TIMESTAMPTZ NOT NULL,
      triggered_at        TIMESTAMPTZ,
      updated_at          TIMESTAMPTZ NOT NULL
    )
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_watch_entity
      ON watch_objects (entity_id, tenant_id)
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_watch_status
      ON watch_objects (status, expires_at)
  `);
}
