import { slugify } from "@/lib/format";

export function notionMatchKey(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[’‘]/g, "'")
    .replace(/[^a-zA-Z0-9']+/g, " ")
    .trim()
    .toLowerCase();
}

export function notionTaskStatusKey(value: string | null | undefined) {
  const key = notionMatchKey(value);
  if (["in progress", "started", "doing"].includes(key)) return "in_progress";
  if (["ready for revision", "revision", "client revision"].includes(key)) return "ready_for_revision";
  if (["final draft notes", "notes client info", "final draft", "notes"].includes(key)) return "final_draft_notes";
  if (["ready to post", "approved", "ready"].includes(key)) return "ready_to_post";
  if (["posted done", "done", "complete", "completed", "posted"].includes(key)) return "posted_done";
  return "not_started";
}

export function notionJobStatusKey(value: string | null | undefined) {
  const key = notionMatchKey(value);
  if (["scheduled", "booked"].includes(key)) return "scheduled";
  if (["in progress", "in production", "production", "started", "doing"].includes(key)) return "production";
  if (["ready for revision", "final draft notes", "ready to post", "client review", "review", "revision"].includes(key)) return "review";
  if (["posted done", "done", "complete", "completed", "delivered", "posted"].includes(key)) return "delivered";
  return "planning";
}

export function notionPriority(value: string | null | undefined): "low" | "normal" | "high" | "urgent" {
  const key = notionMatchKey(value);
  if (key === "urgent") return "urgent";
  if (key === "high") return "high";
  if (key === "low") return "low";
  return "normal";
}

export function notionClientPriority(value: string | null | undefined): "low" | "standard" | "high" | "vip" {
  const key = notionMatchKey(value);
  if (key === "vip") return "vip";
  if (key === "high") return "high";
  if (key === "low") return "low";
  return "standard";
}

export function notionClientStatus(value: string | null | undefined): "lead" | "active" | "paused" | "inactive" {
  const key = notionMatchKey(value);
  if (key === "lead") return "lead";
  if (key === "paused") return "paused";
  if (key === "inactive") return "inactive";
  return "active";
}

export function notionJobNumber(pageId: string) {
  return `NTN-${pageId.replaceAll("-", "").slice(-12).toUpperCase()}`;
}

export function uniqueNotionClientSlug(name: string, pageId: string, usedSlugs: Set<string>) {
  const base = slugify(name) || "notion-client";
  if (!usedSlugs.has(base)) {
    usedSlugs.add(base);
    return base;
  }
  const suffix = pageId.replaceAll("-", "").slice(-8).toLowerCase();
  const candidate = `${base}-notion-${suffix}`;
  usedSlugs.add(candidate);
  return candidate;
}

export function safeNotionDateWindow(shootDate: string | null, dueDate: string | null) {
  return { shootDate, dueDate: shootDate && dueDate && dueDate < shootDate ? null : dueDate };
}

export function joinNotionNotes(parts: Array<string | null | undefined>, maximumLength: number) {
  const value = parts.map((part) => part?.trim()).filter(Boolean).join("\n\n");
  return value ? value.slice(0, maximumLength) : null;
}
