import { z } from "zod";

/** One plain-text deliverable per line; no HTML or opaque JSON in the editor. */
export const jobDeliverablesInputSchema = z.string().max(10_000).transform((value) => value
  .split(/\r?\n/)
  .map((line) => line.replace(/^\s*(?:[-*•]\s+|\d+[.)]\s+)/, "").trim())
  .filter(Boolean))
  .pipe(z.array(z.string().max(300, "Keep each deliverable under 300 characters.")).max(30, "Add up to 30 deliverables."));
