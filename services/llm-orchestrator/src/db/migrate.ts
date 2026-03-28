import postgres from "postgres";
import { config } from "../config.js";

/**
 * Ensures the reasoning_cycles table exists.
 * Called once at service startup.
 */
export async function runMigrations(): Promise<void> {
  const sql = postgres(config.databaseUrl);

  await sql`
    CREATE TABLE IF NOT EXISTS reasoning_cycles (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      reasoning_cycle_id  TEXT NOT NULL UNIQUE,
      watch_id            UUID NOT NULL,
      entity_id           TEXT NOT NULL,
      tenant_id           TEXT NOT NULL,
      context_snapshot    JSONB NOT NULL,
      agent_reasoning     TEXT,
      tools_called        JSONB NOT NULL DEFAULT '[]',
      steps_used          INTEGER,
      status              TEXT NOT NULL DEFAULT 'running',
      error_message       TEXT,
      started_at          TIMESTAMPTZ NOT NULL,
      completed_at        TIMESTAMPTZ
    )
  `;

  await sql.end();
}
