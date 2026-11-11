import {beforeEach,describe,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({service:vi.fn(),send:vi.fn()}));
vi.mock("@/lib/supabase/service",()=>({createServiceClient:mocks.service}));
vi.mock("@/lib/push-notifications",()=>({sendPushNotifications:mocks.send}));
import {dispatchCalendarReminders} from "./calendar-reminders";
let data:Record<string,unknown[]>,sent:unknown[],deliveries:number;
const subscription=(user:string,scope:string|null="apg")=>({id:user,endpoint:`https://push.example/${user}`,p256dh:"key",auth_key:"auth",user_id:user,client_scope_id:scope});
class Query {
  action="read";
  constructor(readonly table:string){}
  select(){return this;}eq(){return this;}is(){return this;}or(){return this;}gte(){return this;}lte(){return this;}in(){return this;}
  insert(){this.action="insert";return this;}update(){this.action="update";return this;}delete(){return this;}
  run(){if(this.table==="website-calendar-reminder-deliveries"&&this.action==="insert"){deliveries++;return {data:{id:"delivery"},error:null};}return {data:data[this.table]??[],error:null};}
  single(){return Promise.resolve(this.run());}maybeSingle(){return Promise.resolve(this.run());}
  then<T>(resolve:(value:ReturnType<Query["run"]>)=>T){return Promise.resolve(this.run()).then(resolve);}
}
beforeEach(()=>{
  vi.clearAllMocks();sent=[];deliveries=0;
  data={
    "website-calendar-reminder-settings":[{workspace_id:"w",enabled:true,default_event_time:"09:00:00",lead_minutes:60,send_at_event_time:false,notify_job_starts:true,notify_job_deadlines:false,notify_task_deadlines:false,notify_campaign_assets:false,notify_flights:false,flight_lead_minutes:180,timezone:"Australia/Brisbane"}],
    "website-jobs":[{id:"job",title:"APG shoot",client_id:"apg",status_id:"scheduled",shoot_date:"2026-11-11",shoot_time:"10:00:00",due_date:null,due_time:null,assignee_ids:["john"]}],
    "website-clients":[{id:"apg",name:"Autopacific Group"},{id:"other",name:"Other client"}],
    "website-job-statuses":[{id:"scheduled",is_closed:false}],
    "website-push-subscriptions":[subscription("john"),subscription("follower"),subscription("unrelated"),subscription("admin",null),subscription("removed")],
    "website-production-team":[{user_id:"john"},{user_id:"follower"},{user_id:"unrelated"}],
    "website-admin-users":[{user_id:"admin"}],
    "website-work-record-followers":[{record_kind:"job",record_id:"job",user_id:"follower"},{record_kind:"job",record_id:"job",user_id:"removed"}],
  };
  mocks.service.mockReturnValue({from:(table:string)=>new Query(table)});
  mocks.send.mockImplementation(async(subscriptions:unknown[])=>{sent=subscriptions;return {configured:true,delivered:subscriptions.length,failed:0,expiredIds:[]};});
});
describe("live reminder dispatch recipient filtering",()=>{
  it("sends only to assigned/following active accounts, not all viewers or admins",async()=>{
    expect(await dispatchCalendarReminders(new Date("2026-11-10T23:00:00Z"))).toMatchObject({delivered:2,failed:0});
    expect(sent).toEqual([subscription("john"),subscription("follower")]);
  });
  it("allows an interested full CRM admin but not an unrelated admin",async()=>{
    data["website-work-record-followers"].push({record_kind:"job",record_id:"job",user_id:"admin"});
    await dispatchCalendarReminders(new Date("2026-11-10T23:00:00Z"));expect(sent).toEqual([subscription("john"),subscription("follower"),subscription("admin",null)]);
  });
  it("does not inherit job follows onto task reminders",async()=>{
    Object.assign(data["website-calendar-reminder-settings"][0]!,{notify_job_starts:false,notify_task_deadlines:true});
    data["website-task-statuses"]=[{id:"open",is_open:true}];
    data["website-job-tasks"]=[{id:"task",title:"Asset",job_id:"job",status_id:"open",due_date:"2026-11-11",due_time:"10:00:00",assignee_ids:["john"]}];
    await dispatchCalendarReminders(new Date("2026-11-10T23:00:00Z"));expect(sent).toEqual([subscription("john")]);
  });
  it("does not reserve or retry an empty notification audience",async()=>{
    data["website-push-subscriptions"]=[subscription("unrelated")];
    expect(await dispatchCalendarReminders(new Date("2026-11-10T23:00:00Z"))).toMatchObject({delivered:0,failed:0});
    expect(deliveries).toBe(0);expect(mocks.send).not.toHaveBeenCalled();
  });
});
