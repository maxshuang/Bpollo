import { z } from "zod"

// ---------------------------------------------------------------------------
// TriggerCondition — what wakes a watch
// ---------------------------------------------------------------------------
export const TriggerConditionSchema = z.discriminatedUnion("type", [
  z.object({
    type:       z.literal("event_match"),
    event_type: z.string(),
    filters:    z.record(z.unknown()).optional(),
  }),
  z.object({
    type:       z.literal("absence"),
    event_type: z.string(),
    deadline:   z.string().datetime(),
  }),
  z.object({
    type:         z.literal("pattern"),
    pattern_name: z.string(),
    params:       z.record(z.unknown()).optional(),
  }),
])

export type TriggerCondition = z.infer<typeof TriggerConditionSchema>

// ---------------------------------------------------------------------------
// ExpectedSignal — what we're waiting for
// ---------------------------------------------------------------------------
export const ExpectedSignalSchema = z.object({
  event_type: z.string(),
  deadline:   z.string().datetime(),
  required:   z.boolean(),
  received:   z.boolean().default(false),
})

export type ExpectedSignal = z.infer<typeof ExpectedSignalSchema>

// ---------------------------------------------------------------------------
// WatchObject — a monitored case
// ---------------------------------------------------------------------------
export const WatchObjectSchema = z.object({
  watch_id:           z.string().uuid(),
  entity_id:          z.string(),
  tenant_id:          z.string(),
  status:             z.enum(["waiting", "triggered", "running", "resolved", "escalated", "expired"]),
  risk_level:         z.enum(["low", "medium", "high", "critical"]),
  scope:              z.enum(["entity", "site", "tenant"]).default("entity"),
  reason:             z.string(),
  graph_snapshot:     z.record(z.unknown()),
  trigger_conditions: z.array(TriggerConditionSchema),
  expected_signals:   z.array(ExpectedSignalSchema),
  created_at:         z.string().datetime(),
  expires_at:         z.string().datetime(),
  triggered_at:       z.string().datetime().optional(),
  history:            z.array(z.record(z.unknown())).default([]),
})

export type WatchObject = z.infer<typeof WatchObjectSchema>

// ---------------------------------------------------------------------------
// WatchCreationRequest — what Trigger Engine sends to Watch Manager
// ---------------------------------------------------------------------------
export const WatchCreationRequestSchema = WatchObjectSchema.omit({
  watch_id:     true,
  status:       true,
  created_at:   true,
  triggered_at: true,
  history:      true,
})

export type WatchCreationRequest = z.infer<typeof WatchCreationRequestSchema>

// ---------------------------------------------------------------------------
// WatchMatch — what goes onto the run queue
// ---------------------------------------------------------------------------
export const WatchMatchSchema = z.object({
  watch_id:          z.string().uuid(),
  trigger_type:      z.enum(["event_match", "absence", "pattern"]),
  triggering_event:  z.record(z.unknown()).optional(),
  matched_condition: TriggerConditionSchema,
  watch_context:     WatchObjectSchema,
})

export type WatchMatch = z.infer<typeof WatchMatchSchema>
