import { z } from "zod";

// ---------------------------------------------------------------------------
// LLMDecision — what the orchestrator decided and why
// ---------------------------------------------------------------------------

export const LLMActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("resolve_watch"), watch_id: z.string().uuid() }),
  z.object({
    type: z.literal("escalate_watch"),
    watch_id: z.string().uuid(),
    new_risk_level: z.enum(["low", "medium", "high", "critical"]),
    reason: z.string(),
  }),
  z.object({
    type: z.literal("extend_watch"),
    watch_id: z.string().uuid(),
    new_expires_at: z.string().datetime(),
    reason: z.string(),
  }),
  z.object({
    type: z.literal("spawn_watch"),
    watch_id: z.string().uuid(),
    reason: z.string(),
  }),
  z.object({
    type: z.literal("dispatch_alert"),
    watch_id: z.string().uuid(),
    priority: z.enum(["low", "medium", "high", "critical"]),
    message: z.string(),
    recommendation: z.string(),
  }),
  z.object({
    type: z.literal("stand_down"),
    watch_id: z.string().uuid(),
    reason: z.string(),
  }),
]);

export type LLMAction = z.infer<typeof LLMActionSchema>;

export const LLMDecisionSchema = z.object({
  reasoning_cycle_id: z.string(),
  watch_id: z.string().uuid(),
  actions_taken: z.array(LLMActionSchema),
  agent_reasoning: z.string(),
  decided_at: z.string().datetime(),
});

export type LLMDecision = z.infer<typeof LLMDecisionSchema>;
