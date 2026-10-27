import { describe, expect, it, vi } from "vitest";
import { campaignProgress, campaignWeekRange, changeCampaignStart, newCampaignId, newCampaignJob, newCampaignWeek, type CampaignPlan } from "./production-campaigns";
import { campaignPlanSchema } from "./production-campaign-schema";
const stages = ["planning", "scheduled", "production", "review", "delivered", "delayed"].map((key, i) => ({ id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`, key, label: key, color: "#579", position: i, is_closed: i > 3 }));
const plan = (keys: string[]): CampaignPlan => ({ id: crypto.randomUUID(), title: "RAT Run campaign", objective: null, notes: null, updated_at: null, start_date: "2026-12-30", weeks: [{ id: crypto.randomUUID(), title: "Launch", jobs: keys.map(key => ({ ...newCampaignJob(stages.find(stage => stage.key === key)!.id), title: "Episode one", shoot_date: "2026-12-30", due_date: "2027-01-02", deliverables: [{ id: crypto.randomUUID(), name: "Trailer", date: "2027-01-01" }] })) }] });
describe("weekly campaigns", () => {
  it("uses inclusive seven-day blocks across month/year boundaries", () => {
    expect(campaignWeekRange("2026-12-30", 0)).toEqual({ start: "2026-12-30", end: "2027-01-05" });
    expect(campaignWeekRange("2026-12-30", 1)).toEqual({ start: "2027-01-06", end: "2027-01-12" });
    expect(campaignWeekRange("2028-02-26", 0).end).toBe("2028-03-03");
  });
  it.each([
    [["production", "production", "production", "production", "scheduled"], "scheduled"],
    [["production", "production", "production"], "production"],
    [["review", "delivered", "production"], "production"],
    [["planning", "delivered"], "planning"],
    [["delivered", "delivered"], "delivered"],
    [["delayed", "scheduled"], "scheduled"],
    [[], "planning"],
  ])("derives %s from the least-advanced non-delayed job", (keys, expected) => {
    expect(campaignProgress(plan(keys), stages).status?.key).toBe(expected);
  });
  it("shifts planned job/deliverable dates but leaves production history intact", () => {
    const original = plan(["scheduled", "production", "delivered"]);
    const shifted = changeCampaignStart(original, "2027-01-06", stages);
    expect(shifted.weeks[0].jobs[0].shoot_date).toBe("2027-01-06");
    expect(shifted.weeks[0].jobs[0].deliverables[0].date).toBe("2027-01-08");
    expect(shifted.weeks[0].jobs[1].shoot_date).toBe("2026-12-30");
    expect(shifted.weeks[0].jobs[2].shoot_date).toBe("2026-12-30");
    expect(original.weeks[0].jobs[0].shoot_date).toBe("2026-12-30");
  });
  it("starts each new week with one undated planning job", () => {
    const week = newCampaignWeek(stages[0].id);
    expect(week.jobs).toHaveLength(1);
    expect(week.jobs[0]).toMatchObject({ status_id: stages[0].id, shoot_date: null, due_date: null });
  });
  it("generates valid unique identifiers on older kiosk browsers too", () => {
    const original = globalThis.crypto;
    vi.stubGlobal("crypto", { getRandomValues: original.getRandomValues.bind(original) });
    try {
      const ids = Array.from({ length: 20 }, () => newCampaignId());
      expect(new Set(ids).size).toBe(20);
      expect(ids.every(id => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id))).toBe(true);
    } finally { vi.unstubAllGlobals(); }
  });
  it("validates an entire draft and rejects duplicate IDs/invalid date windows", () => {
    const draft = plan(["planning"]);
    expect(campaignPlanSchema.safeParse(draft).success).toBe(true);
    expect(campaignPlanSchema.safeParse({ ...draft, weeks: [] }).success).toBe(false);
    expect(campaignPlanSchema.safeParse({ ...draft, weeks: [draft.weeks[0], draft.weeks[0]] }).success).toBe(false);
    draft.weeks[0].jobs[0].due_date = "2026-12-01";
    expect(campaignPlanSchema.safeParse(draft).success).toBe(false);
  });
});
