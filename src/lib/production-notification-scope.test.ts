import {describe,expect,it} from "vitest";
import {receivesProductionReminder,reminderFollowKey} from "./production-notification-scope";
const base={subscription:{user_id:"john",client_scope_id:"apg"},experience:"autopacific" as const,clientIsAutopacific:true,allowedUsers:new Set(["john","nathan"]),assignees:[] as string[],followers:[] as string[]};
describe("personal AutoPacific reminder audience",()=>{
  it("does not notify a team member merely because they can view shared work",()=>expect(receivesProductionReminder(base)).toBe(false));
  it("includes assigned people",()=>expect(receivesProductionReminder({...base,assignees:["john"]})).toBe(true));
  it("includes followers without making them assignees",()=>expect(receivesProductionReminder({...base,followers:["john"]})).toBe(true));
  it("deduplicates the overlapping reasons as one subscription match",()=>expect(receivesProductionReminder({...base,assignees:["john"],followers:["john"]})).toBe(true));
  it("does not inherit a colleague's assignment or follow",()=>expect(receivesProductionReminder({...base,assignees:["nathan"],followers:["nathan"]})).toBe(false));
  it("rejects disabled/removed people even if an old assignment or follow remains",()=>expect(receivesProductionReminder({...base,allowedUsers:new Set(),assignees:["john"],followers:["john"]})).toBe(false));
  it("also requires personal interest for unscoped full CRM subscriptions",()=>{
    expect(receivesProductionReminder({...base,subscription:{user_id:"john",client_scope_id:null}})).toBe(false);
    expect(receivesProductionReminder({...base,subscription:{user_id:"john",client_scope_id:null},followers:["john"]})).toBe(true);
  });
  it("never sends AutoPacific work to an unrelated client subscription",()=>expect(receivesProductionReminder({...base,clientIsAutopacific:false,assignees:["john"]})).toBe(false));
  it("fails closed without a recipient account",()=>expect(receivesProductionReminder({...base,subscription:{client_scope_id:"apg"},assignees:["john"]})).toBe(false));
  it("preserves unrelated TruShot workspace reminders for full CRM devices",()=>{
    expect(receivesProductionReminder({...base,experience:"trushot",subscription:{user_id:"admin",client_scope_id:null}})).toBe(true);
    expect(receivesProductionReminder({...base,experience:"trushot"})).toBe(false);
  });
  it("keeps job and task following independent, including UUID collisions",()=>{
    expect(reminderFollowKey("job_start","same")).toBe("job:same");expect(reminderFollowKey("job_due","same")).toBe("job:same");
    expect(reminderFollowKey("task_due","same")).toBe("task:same");expect(reminderFollowKey("flight_departure","same")).toBeNull();
  });
});
