// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe,expect,it,vi } from "vitest";
import { JobMapWorkspace } from "./job-map-workspace";
import type { TabletJobRecord } from "@/lib/types";
vi.mock("next/dynamic",()=>({default:()=>function MapMock(){return <div>Interactive map</div>;}}));
const location={version:1 as const,label:"Melbourne",latitude:-37.81,longitude:144.96,provider:"manual" as const,precision:"city" as const,attribution:"Approximate city"};
const jobs=[{id:"completed",title:"Completed Melbourne shoot",location:"Melbourne",location_details:location,shoot_date:"2025-01-01",status_id:"done",status:{key:"delivered",label:"Delivered",is_closed:true}},{id:"current",title:"New Melbourne shoot",location:"Melbourne",location_details:location,shoot_date:"2026-11-09",status_id:"scheduled",status:{label:"Scheduled"}},{id:"unknown",title:"Unconfirmed venue",location:"Glass House",shoot_date:"2026-11-10",status_id:"scheduled"}] as TabletJobRecord[];
describe("job map history",()=> {
  it("groups locations, includes completed history, opens the real brief, and keeps ambiguous locations unplaced",async()=> {
    (globalThis as typeof globalThis&{IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
    const host=document.createElement("div");document.body.append(host);const root=createRoot(host);const open=vi.fn();
    try {
      await act(async()=>root.render(<JobMapWorkspace jobs={jobs} statuses={[]} dark={false} onOpen={open}/>));
      expect(host.textContent).toContain("2 jobs · 1 location");
      await act(async()=>host.querySelector<HTMLButtonElement>(".job-map-location")!.click());
      expect([...host.querySelectorAll(".job-map-job strong")].map(node=>node.textContent)).toEqual(["New Melbourne shoot","Completed Melbourne shoot"]);
      expect(host.textContent).toContain("Approximate area, not an exact venue");
      await act(async()=>host.querySelector<HTMLButtonElement>(".job-map-job.is-complete")!.click());expect(open).toHaveBeenCalledWith(jobs[0]);
      await act(async()=>[...host.querySelectorAll("button")].find(button=>button.textContent==="Needs location (1)")!.click());
      expect(host.textContent).toContain("Glass House");expect(host.querySelectorAll(".job-map-unplaced")).toHaveLength(1);
    } finally {await act(async()=>root.unmount());host.remove();}
  });
});
