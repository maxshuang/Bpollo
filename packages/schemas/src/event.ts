import { z } from "zod";

// ---------------------------------------------------------------------------
// Base Event — fields every service needs regardless of event type
// ---------------------------------------------------------------------------
export const BaseEventSchema = z.object({
  event_id: z.string().uuid(),
  event_type: z.string(),
  entity_id: z.string(),
  tenant_id: z.string(),
  source_system: z.string(),
  timestamp: z.string().datetime(),
  correlation_id: z.string().uuid().optional(),
});

export type BaseEvent = z.infer<typeof BaseEventSchema>;

// ---------------------------------------------------------------------------
// Domain Events — extend base with a z.literal() discriminator
// ---------------------------------------------------------------------------

export const InspectionSubmittedEventSchema = BaseEventSchema.extend({
  event_type: z.literal("inspection.submitted"),
  site_id: z.string(),
  inspector_id: z.string(),
});

export const InspectionIssueFlaggedEventSchema = BaseEventSchema.extend({
  event_type: z.literal("inspection.issue_flagged"),
  site_id: z.string(),
  issue_id: z.string(),
  issue_type: z.string(),
  severity: z.enum(["low", "medium", "high", "critical"]),
});

export const ActionCreatedEventSchema = BaseEventSchema.extend({
  event_type: z.literal("action.created"),
  action_id: z.string(),
  issue_id: z.string(),
  assigned_to: z.string().optional(),
  due_date: z.string().datetime().optional(),
});

export const ActionOverdueEventSchema = BaseEventSchema.extend({
  event_type: z.literal("action.overdue"),
  action_id: z.string(),
  overdue_by_hours: z.number(),
});

export const ActionResolvedEventSchema = BaseEventSchema.extend({
  event_type: z.literal("action.resolved"),
  action_id: z.string(),
  resolved_by: z.string(),
});

export const InvestigationOpenedEventSchema = BaseEventSchema.extend({
  event_type: z.literal("investigation.opened"),
  investigation_id: z.string(),
  linked_issue_ids: z.array(z.string()),
  severity: z.enum(["low", "medium", "high", "critical"]),
});

export const InvestigationClosedEventSchema = BaseEventSchema.extend({
  event_type: z.literal("investigation.closed"),
  investigation_id: z.string(),
  outcome: z.enum(["resolved", "escalated", "inconclusive"]),
});

// ---------------------------------------------------------------------------
// BpolloEvent — discriminated union of all known event types
// Unknown event types are rejected at the ingestion boundary.
// ---------------------------------------------------------------------------
export const BpolloEventSchema = z.discriminatedUnion("event_type", [
  InspectionSubmittedEventSchema,
  InspectionIssueFlaggedEventSchema,
  ActionCreatedEventSchema,
  ActionOverdueEventSchema,
  ActionResolvedEventSchema,
  InvestigationOpenedEventSchema,
  InvestigationClosedEventSchema,
]);

export type BpolloEvent = z.infer<typeof BpolloEventSchema>;
