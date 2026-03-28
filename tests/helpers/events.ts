import { randomUUID } from "crypto"

export function makeEvent(overrides: Record<string, unknown> = {}) {
  return {
    event_id:      randomUUID(),
    event_type:    "inspection.submitted",
    entity_id:     `entity-${randomUUID()}`,
    tenant_id:     "tenant-test",
    source_system: "test-suite",
    timestamp:     new Date().toISOString(),
    site_id:       "site-1",
    inspector_id:  "inspector-1",
    ...overrides,
  }
}

export function makeActionEvent(overrides: Record<string, unknown> = {}) {
  return {
    event_id:      randomUUID(),
    event_type:    "action.created",
    entity_id:     `entity-${randomUUID()}`,
    tenant_id:     "tenant-test",
    source_system: "test-suite",
    timestamp:     new Date().toISOString(),
    action_id:     randomUUID(),
    issue_id:      randomUUID(),
    ...overrides,
  }
}
