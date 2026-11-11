import {beforeEach,expect,it,vi} from "vitest";
import type {SupabaseClient} from "@supabase/supabase-js";
import {ClickUpApiError,type ClickUpTask} from "./client";
const mocks=vi.hoisted(()=>({get:vi.fn(),tasks:vi.fn()}));
vi.mock("./client",async original=>({...await original<typeof import("./client")>(),getClickUpTask:mocks.get,getClickUpTasks:mocks.tasks}));
import {processPersonalInbox} from "./personal-inbound";
import {personalMarker,personalOwnedHash,personalRemoteHash,type PersonalConnection} from "./personal-model";
const connection:PersonalConnection={id:"conn",workspace_id:"ws",user_id:"person",list_id:"list",list_name:"Personal",assigned_user_id:42,assigned_user_name:"Nathan",enabled:true,status_mapping:{planning:"PLANNING",scheduled:"SCHEDULED",production:"EDITING",review:"APPROVAL",delayed:"DELAYED",delivered:"COMPLETE"}};
type Row=Record<string,unknown>;
let tables:Record<string,Row[]>,rpc:ReturnType<typeof vi.fn>,service:SupabaseClient,remote:ClickUpTask;
const shared={title:"Original",status:"SCHEDULED",shoot_date:null,shoot_time:null,due_date:null,due_time:null};
beforeEach(()=>{
  vi.clearAllMocks();remote={id:"remote",name:"Original",list:{id:"list"},assignees:[{id:42}],status:{status:"SCHEDULED"},markdown_description:personalMarker("conn","job","job",1),start_date:null,due_date:null};mocks.get.mockImplementation(async id=>{if(id===remote.id)return remote;throw new ClickUpApiError("missing",404);});
  tables={
    "website-clickup-personal-inbox":[{connection_id:"conn",remote_id:"remote",revision:1,available_at:"2000-01-01"}],
    "website-clickup-personal-links":[{connection_id:"conn",record_kind:"job",record_id:"job",record_title:"Original",clickup_task_id:"remote",generation:1,last_remote_hash:personalRemoteHash(remote),last_owned_hash:personalOwnedHash(remote),last_shared_state:shared,identity_confirmed:true,origin:"crm",archived_at:null}],
    "website-jobs":[{id:"job",workspace_id:"ws",title:"Original",status_id:"scheduled",assignee_ids:["person"],archived_at:null,updated_at:"2026-11-11T01:00:00Z",shoot_date:null,shoot_time:null,due_date:null,due_time:null}],
    "website-job-tasks":[],"website-job-statuses":[{id:"scheduled",workspace_id:"ws",key:"scheduled"}],"website-task-statuses":[],
  };
  rpc=vi.fn(async()=>({data:"imported",error:null}));
  service={rpc,from:(table:string)=>{
    let predicate=(row:Row)=>Boolean(row),action="select",values:Row={};const q:Record<string,unknown>={};
    for(const key of ["select","order","limit"])q[key]=()=>q;
    q.eq=(key:string,value:unknown)=>{const old=predicate;predicate=row=>old(row)&&row[key]===value;return q;};
    q.is=(key:string,value:unknown)=>{const old=predicate;predicate=row=>old(row)&&row[key]===value;return q;};
    q.lte=()=>q;q.update=(input:Row)=>{action="update";values=input;return q;};q.delete=()=>{action="delete";return q;};
    function result(single=false){const rows=(tables[table]??[]).filter(predicate);if(action==="update")for(const row of rows)Object.assign(row,values);if(action==="delete")tables[table]=(tables[table]??[]).filter(row=>!predicate(row));return {data:single?rows[0]??null:rows,error:null,count:rows.length};}
    q.single=async()=>result(true);q.maybeSingle=async()=>result(true);q.then=(resolve:(value:unknown)=>unknown)=>Promise.resolve(result()).then(resolve);return q;
  }} as unknown as SupabaseClient;
});
const run=()=>processPersonalInbox(service,connection,"lease",async()=>{});
it("imports remote-only title changes with a compare-and-swap timestamp, not assignments or notes",async()=>{remote.name="ClickUp title";await run();expect(rpc).toHaveBeenCalledWith("website-apply-personal-clickup",expect.objectContaining({p_connection:"conn",p_record:"job",p_expected:"2026-11-11T01:00:00Z",p_state:{...shared,title:"ClickUp title"},p_status_key:"scheduled",p_description:null}));expect(tables["website-clickup-personal-inbox"]).toHaveLength(0);});
it("does not import divergent simultaneous edits",async()=>{remote.name="ClickUp";tables["website-jobs"][0].title="CRM";await run();expect(rpc).not.toHaveBeenCalled();expect(tables["website-clickup-personal-links"][0].last_error).toContain("Both CRM and ClickUp");});
it("imports the explicit manager-reviewed ClickUp version, but not a newer edit",async()=>{remote.name="ClickUp";tables["website-jobs"][0].title="CRM";tables["website-clickup-personal-links"][0].accept_remote_hash=personalRemoteHash(remote);await run();expect(rpc).toHaveBeenCalledOnce();});
it("preserves CRM-owned brief changes made independently in ClickUp",async()=>{remote.name="ClickUp";remote.markdown_description+="\nRemote brief edit";await run();expect(rpc).not.toHaveBeenCalled();expect(tables["website-clickup-personal-inbox"][0].last_error).toContain("brief");});
it("does not override a job stage controlled by its assets",async()=>{remote.status={status:"COMPLETE"};tables["website-job-tasks"].push({id:"asset",workspace_id:"ws",job_id:"job",archived_at:null});await run();expect(rpc).not.toHaveBeenCalled();expect(tables["website-clickup-personal-inbox"][0].last_error).toContain("linked assets");});
it("does not echo a completed outbound write into another CRM mutation",async()=>{await run();expect(rpc).not.toHaveBeenCalled();expect(tables["website-clickup-personal-inbox"]).toHaveLength(0);});
it("only claims new items assigned to the connected ClickUp person",async()=>{tables["website-clickup-personal-links"]=[];remote.markdown_description="New brief";remote.assignees=[{id:999}];await run();expect(rpc).not.toHaveBeenCalled();});
it("does not import a new task from another list",async()=>{tables["website-clickup-personal-links"]=[];remote.markdown_description="New brief";remote.list={id:"other"};await run();expect(rpc).not.toHaveBeenCalled();});
it("ignores generated copies until their outbound identity is recovered",async()=>{tables["website-clickup-personal-links"]=[];await run();expect(rpc).not.toHaveBeenCalled();});
it("claims a genuinely new native ClickUp job once in the connection's transaction",async()=>{tables["website-clickup-personal-links"]=[];remote.markdown_description="Native brief";remote.description="Native plain brief";await run();expect(rpc).toHaveBeenCalledWith("website-apply-personal-clickup",expect.objectContaining({p_record:null,p_kind:"job",p_parent:null,p_status_key:"scheduled",p_description:"Native plain brief"}));});
it("does not delete a shared CRM job when its personal ClickUp copy is deleted",async()=>{mocks.get.mockRejectedValue(new ClickUpApiError("gone",404));await run();expect(rpc).not.toHaveBeenCalled();expect(tables["website-jobs"]).toHaveLength(1);expect(tables["website-clickup-personal-links"][0].last_error).toContain("retained");});
it("will not claim an orphan subtask or invent a parent assignment",async()=>{tables["website-clickup-personal-links"]=[];remote.markdown_description="Subtask";remote.parent="parent";mocks.get.mockImplementation(async id=>id==="remote"?remote:{id:"parent",name:"Not assigned",list:{id:"list"},assignees:[{id:999}]});await run();expect(rpc).not.toHaveBeenCalled();expect(tables["website-clickup-personal-inbox"][0].last_error).toContain("Assign the parent");});
it("retains a finer asset review stage when only its title changes",async()=>{
  const taskState={...shared,status:"APPROVAL"};remote.status={status:"APPROVAL"};remote.markdown_description=personalMarker("conn","task","asset",1);
  Object.assign(tables["website-clickup-personal-links"][0],{record_kind:"task",record_id:"asset",last_shared_state:taskState,last_remote_hash:personalRemoteHash(remote),last_owned_hash:personalOwnedHash(remote)});
  tables["website-job-tasks"]=[{id:"asset",workspace_id:"ws",job_id:"job",title:"Original",due_date:null,due_time:null,due_date_is_override:false,updated_at:"2026-11-11T01:00:00Z",archived_at:null,assignee_ids:["person"],status_id:"final"}];
  tables["website-task-statuses"]=[{id:"final",workspace_id:"ws",key:"final_draft_notes"}];remote.name="Asset renamed";await run();expect(rpc).toHaveBeenCalledWith("website-apply-personal-clickup",expect.objectContaining({p_kind:"task",p_status_key:"final_draft_notes"}));
});
