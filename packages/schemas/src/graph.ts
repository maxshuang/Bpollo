import { z } from "zod";

export const SLAViolationSchema = z.object({
  node: z.string(),
  overdue_hours: z.number(),
  violation_description: z.string(),
});

export const DownstreamNodeSchema = z.object({
  node: z.string(),
  sla_hours: z.number().optional(),
  expected: z.boolean(),
});

export const GraphLocationSchema = z.object({
  current_node: z.string(),
  upstream: z.array(z.string()),
  downstream_expected: z.array(DownstreamNodeSchema),
  sla_violations: z.array(SLAViolationSchema),
});

export type GraphLocation = z.infer<typeof GraphLocationSchema>;
export type SLAViolation = z.infer<typeof SLAViolationSchema>;
