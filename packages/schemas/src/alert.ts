import { z } from "zod";

export const AlertSchema = z.object({
  alert_id: z.string().uuid(),
  entity_id: z.string(),
  tenant_id: z.string(),
  watch_id: z.string().uuid().optional(),
  priority: z.enum(["low", "medium", "high", "critical"]),
  message: z.string(),
  recommendation: z.string(),
  read: z.boolean().default(false),
  created_at: z.string().datetime(),
});

export type Alert = z.infer<typeof AlertSchema>;

export const AlertRequestSchema = AlertSchema.omit({
  alert_id: true,
  read: true,
  created_at: true,
});

export type AlertRequest = z.infer<typeof AlertRequestSchema>;
