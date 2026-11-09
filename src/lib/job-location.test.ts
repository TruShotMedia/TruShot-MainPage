import { describe,expect,it } from "vitest";
import { filterMapJobs,geoapifyLocation,groupJobsByLocation,jobLocationInputSchema,locationIsApproximate,normalizeLocationQuery,readJobLocation,type JobLocation } from "./job-location";
import { parseTabletView } from "./tablet-view";
import { workspaceViews,workspaceInitialView } from "./workspace-mode";
import type { TabletJobRecord } from "./types";
const point:JobLocation={version:1,label:"Melbourne",latitude:-37.8136,longitude:144.9631,provider:"manual",precision:"city",attribution:"Approximate city"};
const job=(id:string,date:string|null,override:Partial<TabletJobRecord>={}):TabletJobRecord=>({id,title:`Job ${id}`,shoot_date:date,due_date:null,status_id:"scheduled",location:"Melbourne",location_details:point,...override} as TabletJobRecord);
describe("job locations",()=> {
  it("accepts valid saved locations and rejects malformed coordinates and metadata",()=> {
    expect(readJobLocation(point)).toEqual(point);
    for(const value of [null,{}, {...point,latitude:91},{...point,longitude:-181},{...point,latitude:NaN},{...point,provider:"unknown"},{...point,secret:"no"}]) expect(readJobLocation(value)).toBeNull();
    expect(jobLocationInputSchema.parse("")).toBeNull();
    expect(jobLocationInputSchema.parse(JSON.stringify(point))).toEqual(point);
    expect(jobLocationInputSchema.safeParse("{bad").success).toBe(false);
  });
  it("normalises only whole city aliases without guessing an ambiguous venue",()=> {
    expect(normalizeLocationQuery("  MEL ")).toBe("Melbourne, Victoria, Australia");
    expect(normalizeLocationQuery("  Glass   House ")).toBe("Glass House");
    expect(normalizeLocationQuery("10 Melbourne Street")).toBe("10 Melbourne Street");
  });
  it("groups co-located work, includes completed jobs and orders history newest first",()=> {
    const groups=groupJobsByLocation([job("old","2025-01-01"),job("new","2026-11-01",{status_id:"complete"}),job("bad",null,{location:"Changed location"}),job("unset",null,{location_details:null})]);
    expect(groups).toHaveLength(1);expect(groups[0].jobs.map(job=>job.id)).toEqual(["new","old"]);
  });
  it("filters by text, status and shoot date with due-date fallback",()=> {
    const jobs=[job("a","2026-11-01"),job("b",null,{due_date:"2026-10-01",status_id:"complete"}),job("c",null)];
    expect(filterMapJobs(jobs,{})).toHaveLength(3);
    expect(filterMapJobs(jobs,{search:"melbourne",status:"complete"}).map(job=>job.id)).toEqual(["b"]);
    expect(filterMapJobs(jobs,{from:"2026-10-01",to:"2026-10-31"}).map(job=>job.id)).toEqual(["b"]);
  });
  it("keeps approximate areas distinct from precise or manually placed pins",()=> {
    expect(locationIsApproximate(point)).toBe(true);
    expect(locationIsApproximate({...point,precision:"manual"})).toBe(false);
    expect(geoapifyLocation(null)).toBeNull();
    expect(geoapifyLocation({formatted:"Brisbane",lat:-27.47,lon:153.02,result_type:"city"})?.precision).toBe("city");
    expect(geoapifyLocation({formatted:"Sydney venue",lat:-33.8,lon:151.2,result_type:"building"})?.precision).toBe("address");
    expect(geoapifyLocation({formatted:"Missing coordinates"})).toBeNull();
  });
  it("opts desktop/mobile into Map without adding it to the legacy kiosk rotation",()=> {
    expect(parseTabletView("map")).toBe("map");
    expect(workspaceViews("production",true,true)).not.toContain("map");
    expect(workspaceViews("marketing",true,true,true)).toContain("map");
    expect(workspaceInitialView("map","production",true,true,true)).toBe("map");
    expect(workspaceInitialView("map","production",true,true)).toBe("pipeline");
  });
});
