import { describe,expect,it } from "vitest";
import { jobLocationSchema } from "./job-location";
import { GEEBUNG_JOB_LOCATION,KEYSBOROUGH_JOB_LOCATION,JOB_LOCATION_SHORTCUTS } from "./job-location-presets";
describe("workspace location shortcuts",()=> {
  it("contains valid address pins, with distinct Queensland and Victorian coordinates",()=> {
    expect(jobLocationSchema.parse(GEEBUNG_JOB_LOCATION)).toEqual(GEEBUNG_JOB_LOCATION);
    expect(jobLocationSchema.parse(KEYSBOROUGH_JOB_LOCATION)).toEqual(KEYSBOROUGH_JOB_LOCATION);
    expect(GEEBUNG_JOB_LOCATION.city).toBe("Brisbane");expect(KEYSBOROUGH_JOB_LOCATION.city).toBe("Melbourne");
    expect(GEEBUNG_JOB_LOCATION.label).toBe("352b Bilsen Rd, Geebung QLD 4034");
    expect(KEYSBOROUGH_JOB_LOCATION.label).toBe("49-75 Pacific Dr, Keysborough VIC 3173");
  });
  it("preserves the explicitly requested shortcut/address pairs rather than inferring from the display name",()=> {
    expect(JOB_LOCATION_SHORTCUTS.map(item=>[item.name,item.location.label])).toEqual([
      ["Autopacific Group Melbourne",GEEBUNG_JOB_LOCATION.label],
      ["Cruisemaster Brisbane",KEYSBOROUGH_JOB_LOCATION.label],
    ]);
  });
});
