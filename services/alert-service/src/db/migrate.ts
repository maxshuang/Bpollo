import { db } from "./client.js";
import { sql } from "drizzle-orm";

export async function runMigrations() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS alerts (
      alert_id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      entity_id       TEXT        NOT NULL,
      tenant_id       TEXT        NOT NULL,
      watch_id        UUID,
      priority        TEXT        NOT NULL,
      message         TEXT        NOT NULL,
      recommendation  TEXT        NOT NULL,
      read            BOOLEAN     NOT NULL DEFAULT false,
      created_at      TIMESTAMPTZ NOT NULL
    )
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_alerts_tenant
      ON alerts (tenant_id, created_at DESC)
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_alerts_entity
      ON alerts (entity_id, tenant_id, created_at DESC)
  `);
}
