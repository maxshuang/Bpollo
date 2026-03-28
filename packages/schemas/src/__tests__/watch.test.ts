import { describe, it, expect } from "vitest";
import {
  TriggerConditionSchema,
  WatchCreationRequestSchema,
  WatchObjectSchema,
} from "../watch.js";

const BASE_WATCH_REQUEST = {
  entity_id: "entity-1",
  tenant_id: "tenant-1",
  scope: "entity" as const,
  reason: "Repeated overdue actions",
  risk_level: "high" as const,
  trigger_conditions: [],
  expected_signals: [],
  expires_at: "2024-06-01T00:00:00.000Z",
  graph_snapshot: { current_node: "action_overdue" },
};

// ---------------------------------------------------------------------------
// TriggerConditionSchema — discriminated union on `type`
// ---------------------------------------------------------------------------
describe("TriggerConditionSchema", () => {
  it("accepts event_match condition", () => {
    const result = TriggerConditionSchema.safeParse({
      type: "event_match",
      event_type: "action.overdue",
    });
    expect(result.success).toBe(true);
  });

  it("accepts event_match with optional filters", () => {
    const result = TriggerConditionSchema.safeParse({
      type: "event_match",
      event_type: "action.overdue",
      filters: { severity: "high" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts absence condition with deadline", () => {
    const result = TriggerConditionSchema.safeParse({
      type: "absence",
      event_type: "action.resolved",
      deadline: "2024-03-01T00:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("rejects absence condition missing deadline", () => {
    const result = TriggerConditionSchema.safeParse({
      type: "absence",
      event_type: "action.resolved",
      // deadline missing
    });
    expect(result.success).toBe(false);
  });

  it("accepts pattern condition", () => {
    const result = TriggerConditionSchema.safeParse({
      type: "pattern",
      pattern_name: "repeated-overdue",
    });
    expect(result.success).toBe(true);
  });

  it("rejects unknown condition type", () => {
    const result = TriggerConditionSchema.safeParse({ type: "custom_unknown" });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// WatchCreationRequestSchema
// ---------------------------------------------------------------------------
describe("WatchCreationRequestSchema", () => {
  it("accepts a minimal valid watch request", () => {
    const result = WatchCreationRequestSchema.safeParse(BASE_WATCH_REQUEST);
    expect(result.success).toBe(true);
  });

  it("accepts watch with trigger conditions", () => {
    const result = WatchCreationRequestSchema.safeParse({
      ...BASE_WATCH_REQUEST,
      trigger_conditions: [
        { type: "event_match", event_type: "action.overdue" },
        {
          type: "absence",
          event_type: "action.resolved",
          deadline: "2024-06-01T00:00:00.000Z",
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("accepts watch with expected signals", () => {
    const result = WatchCreationRequestSchema.safeParse({
      ...BASE_WATCH_REQUEST,
      expected_signals: [
        {
          event_type: "action.resolved",
          deadline: "2024-06-01T00:00:00.000Z",
          required: true,
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid scope", () => {
    const result = WatchCreationRequestSchema.safeParse({
      ...BASE_WATCH_REQUEST,
      scope: "global", // not in enum: entity | site | tenant
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid risk_level", () => {
    const result = WatchCreationRequestSchema.safeParse({
      ...BASE_WATCH_REQUEST,
      risk_level: "extreme",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing entity_id", () => {
    const { entity_id: _, ...noEntity } = BASE_WATCH_REQUEST;
    expect(WatchCreationRequestSchema.safeParse(noEntity).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// WatchObjectSchema — full object with auto-generated fields
// ---------------------------------------------------------------------------
describe("WatchObjectSchema", () => {
  const fullWatch = {
    watch_id: "550e8400-e29b-41d4-a716-446655440099",
    status: "waiting",
    created_at: "2024-01-15T10:00:00.000Z",
    history: [],
    ...BASE_WATCH_REQUEST,
  };

  it("accepts a valid watch object with status=waiting", () => {
    expect(WatchObjectSchema.safeParse(fullWatch).success).toBe(true);
  });

  it("accepts all valid status values", () => {
    const statuses = [
      "waiting",
      "triggered",
      "running",
      "resolved",
      "escalated",
      "expired",
    ] as const;
    for (const status of statuses) {
      expect(
        WatchObjectSchema.safeParse({ ...fullWatch, status }).success,
      ).toBe(true);
    }
  });

  it("rejects invalid status", () => {
    expect(
      WatchObjectSchema.safeParse({ ...fullWatch, status: "active" }).success,
    ).toBe(false);
  });

  it("rejects non-UUID watch_id", () => {
    expect(
      WatchObjectSchema.safeParse({ ...fullWatch, watch_id: "not-a-uuid" })
        .success,
    ).toBe(false);
  });

  it("accepts optional triggered_at when status is triggered", () => {
    const result = WatchObjectSchema.safeParse({
      ...fullWatch,
      status: "triggered",
      triggered_at: "2024-01-20T00:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });
});
