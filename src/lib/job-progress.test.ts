import { describe, expect, it } from "vitest";
import { calculateJobProgress } from "./job-progress";
import { clickUpJobProgress } from "./clickup/job-progress";
import { jobProgress } from "./production-team";

const task = (status_key: string) => ({ status_key });
describe("shared workflow progress", () => {
  it.each([["not_started", 0], ["in_progress", 40], ["ready_for_revision", 70], ["final_draft_notes", 90], ["ready_to_post", 95], ["posted_done", 100]])("gives partial credit for %s", (key, percent) => {
    expect(calculateJobProgress({ tasks: [task(String(key))] }).percent).toBe(percent);
  });
  it.each([["planning",0],["scheduled",10],["production",50],["review",90],["delivered",100]])("uses %s for standalone work", (statusKey, percent) => {
    expect(calculateJobProgress({ statusKey: String(statusKey) })).toEqual({ completed: 0, total: 0, percent });
  });
  it("shows 68% for three of four tasks at final review, without calling them complete", () => {
    expect(calculateJobProgress({ tasks: [task("final_draft_notes"),task("final_draft_notes"),task("final_draft_notes"),task("not_started")] })).toEqual({ completed: 0, total: 4, percent: 68 });
  });
  it("calculates the GoPro example as 80% rather than 0%", () => {
    expect(calculateJobProgress({ tasks: [task("in_progress"),...Array.from({length:4},()=>task("final_draft_notes"))] })).toEqual({ completed: 0, total: 5, percent: 80 });
  });
  it("ignores delayed attempts, counts their successors and deduplicates planned deliverables", () => {
    const deliverables = [{id:"one",name:"Episode",date:null},{id:"two",name:"New reel",date:null}];
    const tasks = [{...task("delayed"),source_deliverable_id:"one"},task("final_draft_notes")];
    expect(calculateJobProgress({tasks,deliverables})).toEqual({completed:0,total:2,percent:45});
  });
  it("never rounds incomplete work to 100%, and only Done counts as completed", () => {
    expect(calculateJobProgress({tasks:[...Array.from({length:999},()=>task("posted_done")),task("ready_to_post")]}).percent).toBe(99);
    expect(calculateJobProgress({tasks:[task("posted_done"),task("posted_done")]})).toEqual({completed:2,total:2,percent:100});
    expect(calculateJobProgress({tasks:[task("unknown")],statusKey:"delivered"}).percent).toBe(0);
  });
  it("returns identical results to the CRM card and ClickUp adapters", () => {
    const keys=["not_started","in_progress","ready_for_revision","final_draft_notes","ready_to_post","posted_done","delayed"];
    for (let count=0;count<20;count++) {
      const linked_tasks=Array.from({length:count},(_,index)=>({id:String(index),title:"Output",due_date:null,status_key:keys[index%keys.length]}));
      const card=jobProgress({total_tasks:count,open_tasks:count,linked_tasks,status_id:"scheduled"},[{id:"scheduled",key:"scheduled",label:"Scheduled",color:"#579",position:20,is_closed:false}]);
      const remote=clickUpJobProgress(linked_tasks.map(item=>({status:{key:item.status_key}})),[],"scheduled");
      expect(card).toEqual(remote);
    }
  });
});
