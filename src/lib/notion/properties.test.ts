import { describe, expect, it } from "vitest";
import { notionBoolean, notionDate, notionLinks, notionNumber, notionRelations, notionSelect, notionText, notionTitle } from "@/lib/notion/properties";
import type { NotionPage } from "@/lib/notion/types";

const page: NotionPage = {
  object: "page",
  id: "11111111-1111-4111-8111-111111111111",
  url: "https://www.notion.so/example",
  last_edited_time: "2026-08-25T00:00:00.000Z",
  properties: {
    "Task Name": { type: "title", title: [{ plain_text: "Campaign reel" }] },
    Status: { type: "status", status: { name: "In Progress" } },
    Hours: { type: "number", number: 1.5 },
    "Due Date": { type: "date", date: { start: "2026-08-30T09:00:00+10:00" } },
    Job: { type: "relation", relation: [{ id: "22222222-2222-4222-8222-222222222222" }] },
    Notes: { type: "rich_text", rich_text: [{ plain_text: "Needs captions" }] },
    "Files / Links": { type: "rich_text", rich_text: [{ plain_text: "Drive", href: "https://drive.google.com/example" }] },
    Retainer: { type: "checkbox", checkbox: true },
  },
};

describe("Notion property readers", () => {
  it("reads the property types used by the original TruShot databases", () => {
    expect(notionTitle(page, ["Task Name"])).toBe("Campaign reel");
    expect(notionSelect(page, ["Status"])).toBe("In Progress");
    expect(notionNumber(page, ["Hours"])).toBe(1.5);
    expect(notionDate(page, ["Due Date"])).toBe("2026-08-30");
    expect(notionRelations(page, ["Job"])).toEqual(["22222222-2222-4222-8222-222222222222"]);
    expect(notionText(page, ["Notes"])).toBe("Needs captions");
    expect(notionLinks(page, ["Files / Links"])).toEqual(["https://drive.google.com/example"]);
    expect(notionBoolean(page, ["Retainer"])).toBe(true);
  });
});
