import { z } from "zod";

/** One plain-text deliverable per line; no HTML or opaque JSON in the editor. */
export const jobDeliverablesInputSchema = z.string().max(10_000).transform((value) => value
  .split(/\r?\n/)
  .map((line) => line.replace(/^\s*(?:[-*•]\s+|\d+[.)]\s+)/, "").trim())
  .filter(Boolean))
  .pipe(z.array(z.string().max(300, "Keep each deliverable under 300 characters.")).max(30, "Add up to 30 deliverables."));

const deliverableSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1, "Name each deliverable.").max(300),
  date: z.union([z.iso.date(), z.literal(""), z.null()]).transform((value) => value || null),
});
export const datedJobDeliverablesInputSchema = z.string().max(30_000).transform((value, context) => {
  try { return JSON.parse(value) as unknown; }
  catch { context.addIssue({ code: "custom", message: "The deliverables could not be read. Reopen the job and retry." }); return z.NEVER; }
}).pipe(z.array(deliverableSchema).max(30)).refine((items) => new Set(items.map((item) => item.id)).size === items.length, "Each deliverable needs its own identifier.");
