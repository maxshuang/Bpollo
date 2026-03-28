import { describe, it, expect } from "vitest"
import {
  BaseEventSchema,
  BpolloEventSchema,
  InspectionSubmittedEventSchema,
  InspectionIssueFlaggedEventSchema,
  ActionCreatedEventSchema,
  ActionOverdueEventSchema,
  ActionResolvedEventSchema,
  InvestigationOpenedEventSchema,
  InvestigationClosedEventSchema,
} from "../event.js"

const BASE = {
  event_id:      "550e8400-e29b-41d4-a716-446655440000",
  entity_id:     "entity-abc",
  tenant_id:     "tenant-xyz",
  source_system: "test-system",
  timestamp:     "2024-01-15T10:00:00.000Z",
}

// ---------------------------------------------------------------------------
// BaseEventSchema
// ---------------------------------------------------------------------------
describe("BaseEventSchema", () => {
  it("accepts a valid base event", () => {
    const result = BaseEventSchema.safeParse({ ...BASE, event_type: "anything" })
    expect(result.success).toBe(true)
  })

  it("rejects non-UUID event_id", () => {
    const result = BaseEventSchema.safeParse({ ...BASE, event_type: "x", event_id: "not-a-uuid" })
    expect(result.success).toBe(false)
  })

  it("rejects non-datetime timestamp", () => {
    const result = BaseEventSchema.safeParse({ ...BASE, event_type: "x", timestamp: "2024-01-15" })
    expect(result.success).toBe(false)
  })

  it("accepts optional correlation_id when present and valid UUID", () => {
    const result = BaseEventSchema.safeParse({
      ...BASE, event_type: "x",
      correlation_id: "660e8400-e29b-41d4-a716-446655440001",
    })
    expect(result.success).toBe(true)
  })

  it("rejects invalid correlation_id", () => {
    const result = BaseEventSchema.safeParse({ ...BASE, event_type: "x", correlation_id: "bad" })
    expect(result.success).toBe(false)
  })

  it("requires entity_id", () => {
    const { entity_id: _, ...noEntity } = { ...BASE, event_type: "x" }
    expect(BaseEventSchema.safeParse(noEntity).success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// BpolloEventSchema — discriminated union
// ---------------------------------------------------------------------------
describe("BpolloEventSchema", () => {
  it("rejects unknown event_type", () => {
    const result = BpolloEventSchema.safeParse({ ...BASE, event_type: "unknown.event" })
    expect(result.success).toBe(false)
  })

  it("rejects missing domain fields (e.g. site_id for inspection.submitted)", () => {
    const result = BpolloEventSchema.safeParse({ ...BASE, event_type: "inspection.submitted" })
    expect(result.success).toBe(false)
  })

  // --- inspection.submitted ---
  it("accepts inspection.submitted with required fields", () => {
    const result = BpolloEventSchema.safeParse({
      ...BASE,
      event_type:   "inspection.submitted",
      site_id:      "site-1",
      inspector_id: "user-1",
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.event_type).toBe("inspection.submitted")
    }
  })

  // --- inspection.issue_flagged ---
  it("accepts inspection.issue_flagged", () => {
    const result = BpolloEventSchema.safeParse({
      ...BASE,
      event_type: "inspection.issue_flagged",
      site_id:    "site-1",
      issue_id:   "issue-1",
      issue_type: "electrical",
      severity:   "high",
    })
    expect(result.success).toBe(true)
  })

  it("rejects inspection.issue_flagged with invalid severity", () => {
    const result = BpolloEventSchema.safeParse({
      ...BASE,
      event_type: "inspection.issue_flagged",
      site_id:    "site-1",
      issue_id:   "issue-1",
      issue_type: "electrical",
      severity:   "extreme", // not a valid enum value
    })
    expect(result.success).toBe(false)
  })

  // --- action.created ---
  it("accepts action.created with optional fields absent", () => {
    const result = BpolloEventSchema.safeParse({
      ...BASE,
      event_type: "action.created",
      action_id:  "action-1",
      issue_id:   "issue-1",
    })
    expect(result.success).toBe(true)
  })

  it("accepts action.created with all optional fields", () => {
    const result = BpolloEventSchema.safeParse({
      ...BASE,
      event_type:  "action.created",
      action_id:   "action-1",
      issue_id:    "issue-1",
      assigned_to: "user-2",
      due_date:    "2024-02-01T00:00:00.000Z",
    })
    expect(result.success).toBe(true)
  })

  // --- action.overdue ---
  it("accepts action.overdue", () => {
    const result = BpolloEventSchema.safeParse({
      ...BASE,
      event_type:       "action.overdue",
      action_id:        "action-1",
      overdue_by_hours: 48,
    })
    expect(result.success).toBe(true)
  })

  // --- action.resolved ---
  it("accepts action.resolved", () => {
    const result = BpolloEventSchema.safeParse({
      ...BASE,
      event_type:  "action.resolved",
      action_id:   "action-1",
      resolved_by: "user-3",
    })
    expect(result.success).toBe(true)
  })

  // --- investigation.opened ---
  it("accepts investigation.opened", () => {
    const result = BpolloEventSchema.safeParse({
      ...BASE,
      event_type:       "investigation.opened",
      investigation_id: "inv-1",
      linked_issue_ids: ["issue-1", "issue-2"],
      severity:         "critical",
    })
    expect(result.success).toBe(true)
  })

  it("rejects investigation.opened with non-array linked_issue_ids", () => {
    const result = BpolloEventSchema.safeParse({
      ...BASE,
      event_type:       "investigation.opened",
      investigation_id: "inv-1",
      linked_issue_ids: "issue-1",
      severity:         "low",
    })
    expect(result.success).toBe(false)
  })

  // --- investigation.closed ---
  it("accepts investigation.closed with valid outcome", () => {
    for (const outcome of ["resolved", "escalated", "inconclusive"] as const) {
      const result = BpolloEventSchema.safeParse({
        ...BASE,
        event_type:       "investigation.closed",
        investigation_id: "inv-1",
        outcome,
      })
      expect(result.success).toBe(true)
    }
  })

  it("rejects investigation.closed with invalid outcome", () => {
    const result = BpolloEventSchema.safeParse({
      ...BASE,
      event_type:       "investigation.closed",
      investigation_id: "inv-1",
      outcome:          "dismissed",
    })
    expect(result.success).toBe(false)
  })
})
