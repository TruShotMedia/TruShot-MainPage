import { z } from "zod";

export const assignmentIdsSchema = z.preprocess(value => {
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return null; }
}, z.array(z.uuid()).min(1, "Assign at least one team member.").max(100).transform(ids => [...new Set(ids)])).optional();

/** Omitted fields preserve older CRM forms; explicit empty selections are rejected. */
export function assignmentValues(form: FormData) {
  return form.has("assignee_ids") ? { assignee_ids: assignmentIdsSchema.parse(form.get("assignee_ids")) } : {};
}
