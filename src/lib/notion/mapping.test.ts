import { describe, expect, it } from "vitest";
import {
  joinNotionNotes,
  notionJobStatusKey,
  notionMatchKey,
  notionTaskStatusKey,
  safeNotionDateWindow,
  uniqueNotionClientSlug,
} from "@/lib/notion/mapping";

describe("Notion CRM mapping", () => {
  it("maps the original Notion status labels to the CRM workflows", () => {
    expect(notionTaskStatusKey("Not Started")).toBe("not_started");
    expect(notionTaskStatusKey("Notes/Client Info")).toBe("final_draft_notes");
    expect(notionTaskStatusKey("Posted / Done")).toBe("posted_done");
    expect(notionJobStatusKey("In Progress")).toBe("production");
    expect(notionJobStatusKey("Ready For Revision")).toBe("review");
    expect(notionJobStatusKey("Posted / Done")).toBe("delivered");
  });

  it("normalises titles for the first-run legacy deduplication pass", () => {
    expect(notionMatchKey("  LEND-IT, Nick’s Intro Video  ")).toBe("lend it nick's intro video");
    expect(notionMatchKey("LEND IT — Nick's Intro Video")).toBe("lend it nick's intro video");
  });

  it("protects date constraints and creates collision-safe client slugs", () => {
    expect(safeNotionDateWindow("2026-08-20", "2026-08-19")).toEqual({ shootDate: "2026-08-20", dueDate: null });
    const used = new Set(["ravish-media"]);
    expect(uniqueNotionClientSlug("Ravish Media", "11111111-1111-4111-8111-1234567890ab", used)).toBe("ravish-media-notion-567890ab");
    expect(joinNotionNotes(["One", "", null, "Two"], 100)).toBe("One\n\nTwo");
  });
});
