import { expect, it } from "vitest";
import { outlookNextSyncAt } from "./model";
it("aligns refreshes with quarter-hour cron instead of drifting to every thirty minutes", () => {
  expect(outlookNextSyncAt(new Date("2026-11-10T08:15:04Z"))).toBe("2026-11-10T08:30:00.000Z");
  expect(outlookNextSyncAt(new Date("2026-11-10T08:22:40Z"))).toBe("2026-11-10T08:30:00.000Z");
  expect(outlookNextSyncAt(new Date("2026-11-10T08:15:04Z"), 60)).toBe("2026-11-10T09:15:00.000Z");
});
