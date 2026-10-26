import { describe, expect, it } from "vitest";
import { buildDelayInfoByRecord } from "@/lib/delay-history";

describe("delay history", () => {
  it("keeps the complete lineage when a successor is delayed again", () => {
    const delays = buildDelayInfoByRecord([
      {
        id: "delay-one",
        source_id: "job-original",
        successor_id: "job-first-reschedule",
        reason: "Weather moved the shoot.",
        source_date: "2026-10-05",
        rescheduled_date: "2026-10-09",
        created_at: "2026-10-01T00:00:00Z",
      },
      {
        id: "delay-two",
        source_id: "job-first-reschedule",
        successor_id: "job-second-reschedule",
        reason: "Client approval arrived late.",
        source_date: "2026-10-09",
        rescheduled_date: "2026-10-13",
        created_at: "2026-10-02T00:00:00Z",
      },
    ]);

    expect(delays.get("job-original")).toMatchObject({
      delayed_from: null,
      delayed_to: { id: "delay-one" },
      history: [{ id: "delay-one" }, { id: "delay-two" }],
    });
    expect(delays.get("job-first-reschedule")).toMatchObject({
      delayed_from: { id: "delay-one", reason: "Weather moved the shoot." },
      delayed_to: { id: "delay-two", reason: "Client approval arrived late." },
      history: [{ id: "delay-one" }, { id: "delay-two" }],
    });
    expect(delays.get("job-second-reschedule")).toMatchObject({
      delayed_from: { id: "delay-two" },
      delayed_to: null,
      history: [{ id: "delay-one" }, { id: "delay-two" }],
    });
  });
});
