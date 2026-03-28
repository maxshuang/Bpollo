import { z } from "zod";
import { WatchCreationRequestSchema } from "./watch.js";

// ---------------------------------------------------------------------------
// TriggerResult — output of a single trigger's evaluate() call
// ---------------------------------------------------------------------------
export const TriggerResultSchema = z.object({
  trigger_name: z.string(),
  // null means the trigger did not fire for this event
  watch_creation_request: WatchCreationRequestSchema.nullable(),
});

export type TriggerResult = z.infer<typeof TriggerResultSchema>;

// ---------------------------------------------------------------------------
// EvaluateRequest — input to POST /triggers/evaluate
// ---------------------------------------------------------------------------
export const EvaluateRequestSchema = z.object({
  event: z.record(z.unknown()), // typed as BpolloEvent by consumers
  graph_location: z.object({
    current_node: z.string(),
    upstream: z.array(z.string()),
    downstream_expected: z.array(
      z.object({
        node: z.string(),
        sla_hours: z.number().optional(),
        expected: z.boolean(),
      }),
    ),
    sla_violations: z.array(
      z.object({
        node: z.string(),
        overdue_hours: z.number(),
        violation_description: z.string(),
      }),
    ),
  }),
});

export type EvaluateRequest = z.infer<typeof EvaluateRequestSchema>;
