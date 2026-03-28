import { NextRequest, NextResponse } from "next/server"
import { GRAPH_SERVICE_URL } from "@/lib/config"

/**
 * Proxy: POST /api/locate { entity_id, tenant_id }
 *        → POST /graph/locate (Graph Service)
 *
 * The Graph Service expects a full BaseEvent, but the console only knows
 * entity_id + tenant_id. We use a synthetic event to trigger a lookup
 * of the entity's current persisted state (the event_type is ignored
 * when entity_state already exists in the DB).
 */
export async function POST(req: NextRequest) {
  let body: { entity_id: string; tenant_id: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 })
  }

  if (!body.entity_id || !body.tenant_id) {
    return NextResponse.json({ error: "entity_id and tenant_id are required" }, { status: 400 })
  }

  // Build a minimal synthetic event for the locate call
  const syntheticEvent = {
    event_id:      "00000000-0000-0000-0000-000000000000",
    event_type:    "inspection.submitted",   // fallback — DB state takes precedence
    entity_id:     body.entity_id,
    tenant_id:     body.tenant_id,
    source_system: "console",
    timestamp:     new Date().toISOString(),
  }

  const res = await fetch(`${GRAPH_SERVICE_URL}/graph/locate`, {
    method:  "POST",
    headers: { "content-type": "application/json" },
    body:    JSON.stringify({ event: syntheticEvent }),
  })

  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
