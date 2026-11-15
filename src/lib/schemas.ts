import { z } from "zod";
import { DISASTER_STATUSES, DISASTER_TYPES, SEVERITY_LEVELS, ZONE_STATUSES } from "./constants";

export const disasterSchema = z.object({
  title: z.string().trim().min(3).max(150),
  disaster_type: z.enum(DISASTER_TYPES),
  severity_level: z.enum(SEVERITY_LEVELS),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD"),
  status: z.enum(DISASTER_STATUSES).default("ACTIVE"),
  description: z.string().trim().max(5000).optional().nullable(),
});

export const zoneSchema = z.object({
  disaster_id: z.coerce.number().int().positive(),
  zone_name: z.string().trim().min(2).max(120),
  district: z.string().trim().min(2).max(100),
  latitude: z.coerce.number().min(-90).max(90).optional().nullable(),
  longitude: z.coerce.number().min(-180).max(180).optional().nullable(),
  affected_population: z.coerce.number().int().min(0),
  urgency_score: z.coerce.number().min(0).max(100).optional(),
  status: z.enum(ZONE_STATUSES).default("CRITICAL"),
});

export const centreSchema = z.object({
  manager_id: z.coerce.number().int().positive(),
  centre_name: z.string().trim().min(3).max(150),
  address: z.string().trim().min(3),
  district: z.string().trim().min(2).max(100),
  total_capacity: z.coerce.number().int().positive(),
  current_occupancy: z.coerce.number().int().min(0).default(0),
  contact_phone: z.string().trim().min(5).max(20),
  is_active: z.coerce.boolean().default(true),
});
