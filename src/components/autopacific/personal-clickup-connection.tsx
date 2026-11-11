"use client";

import { useState, useTransition } from "react";
import { Check, ExternalLink, Link2, LoaderCircle, Pause, RefreshCw } from "lucide-react";
import { connectPersonalClickUpList, inspectPersonalClickUpList, pausePersonalClickUpList, retryPersonalClickUpItem,syncPersonalClickUpNow } from "@/app/autopacific/personal-clickup-actions";
import type { TeamDirectoryMember } from "@/lib/production-team";
import type { PersonalConnectionView } from "@/lib/clickup/personal-model";
import "./personal-clickup-connection.css";

const stages = [["planning","Planning"],["scheduled","Scheduled"],["production","In production"],["review","Client review"],["delayed","Delayed"],["delivered","Completed"]] as const;
type Inspection = Awaited<ReturnType<typeof inspectPersonalClickUpList>>;

export function PersonalClickUpConnection({ member, connection, protectedOwner, onRefresh }: {
  member:TeamDirectoryMember; connection?:PersonalConnectionView; protectedOwner:boolean; onRefresh:()=>Promise<void>;
}) {
  const [url,setUrl]=useState(connection?`https://app.clickup.com/9003084068/v/l/li/${connection.list_id}`:"");
  const [inspection,setInspection]=useState<Inspection|null>(null),[assignee,setAssignee]=useState(connection?.assigned_user_id.toString()??"");
  const [mapping,setMapping]=useState<Record<string,string>>(connection?.status_mapping??{});
  const [pending,startTransition]=useTransition();
  const [error,setError]=useState(""),[notice,setNotice]=useState(""),[confirm,setConfirm]=useState("");
  function act(work:()=>Promise<void>) {
    setError("");setNotice("");
    startTransition(async()=>{try{await work();}catch(reason){setError(reason instanceof Error?reason.message:"This connection could not be updated. Please retry.");}});
  }
  if(protectedOwner)return <section className="personal-clickup-reserved"><Link2 size={16}/><div><strong>John’s existing connections are protected</strong><p>Jobs and Outlook keep their current destinations and sync settings.</p></div></section>;
  return <details className="personal-clickup" open={undefined}>
    <summary><Link2 size={15}/><span>Personal ClickUp list <small>Optional · Two-way sync</small></span><b>{connection?.enabled?(member.is_active?"Connected":"Paused with account"):connection?"Paused":"Not connected"}</b></summary>
    <div className="personal-clickup-body">
      <p>Only AutoPacific jobs and assets explicitly assigned to {member.display_name} are sent here. Following and @mentions do not count. Shared work keeps one CRM record and a separate mirror in each person’s list.</p>
      {connection?<div className="personal-clickup-status"><strong>{connection.list_name}</strong><span>Assigned in ClickUp to {connection.assigned_user_name}</span><small>{connection.last_success_at?`Last synced ${new Date(connection.last_success_at).toLocaleString("en-AU")}`:"First sync pending"} · {connection.pending} queued</small>
        <a href={`https://app.clickup.com/9003084068/v/l/li/${connection.list_id}`} target="_blank" rel="noreferrer">Open list <ExternalLink size={12}/></a>
        {connection.last_error?<p role="alert">{connection.last_error}</p>:null}
      </div>:null}
      <label>ClickUp list URL<input type="url" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={url} maxLength={500}
        placeholder="https://app.clickup.com/…/v/l/li/…" disabled={pending||!member.is_active}
        onChange={event=>{setUrl(event.target.value);setInspection(null);setError("");setNotice("");}}/></label>
      <div className="personal-clickup-actions"><button type="button" disabled={pending||!url.trim()||!member.is_active} onClick={()=>act(async()=>{
        const result=await inspectPersonalClickUpList({userId:member.user_id,listUrl:url});setInspection(result);
        setMapping(connection?.list_id===result.listId?connection.status_mapping:result.mapping);
        setAssignee(connection?.list_id===result.listId?String(connection.assigned_user_id):result.suggestedAssignee?.toString()??"");
      })}>{pending?<LoaderCircle className="spin" size={14}/>:<Check size={14}/>}Check list</button>
      {connection?.enabled?<button type="button" disabled={pending} onClick={()=>act(async()=>{await pausePersonalClickUpList(member.user_id);setNotice("Connection paused. Existing ClickUp history has been retained.");await onRefresh();})}><Pause size={14}/>Pause connection</button>:null}
      <button type="button" disabled={pending} onClick={()=>act(onRefresh)}><RefreshCw size={14}/>Refresh status</button></div>
      {connection?.enabled?<button type="button" disabled={pending||!member.is_active} onClick={()=>act(async()=>{await syncPersonalClickUpNow(connection.id);setNotice("Two-way sync queued. Refresh status shortly to see the result.");await onRefresh();})}>Sync now</button>:null}
      {!member.is_active?<p>Enable and save this team member first. A disabled account does not sync.</p>:null}
      {inspection?<div className="personal-clickup-verified"><strong><Check size={14}/>{inspection.listName} verified</strong>
        <label>Assign ClickUp work to<select value={assignee} disabled={pending} onChange={event=>setAssignee(event.target.value)}><option value="">Choose the matching ClickUp person…</option>{inspection.people.map(person=><option key={person.id} value={person.id}>{person.name}{person.email?` · ${person.email}`:""}</option>)}</select></label>
        <fieldset><legend>Status mapping</legend><div className="personal-clickup-mapping">{stages.map(([key,label])=><label key={key}>{label}<select value={mapping[key]??""} disabled={pending} onChange={event=>setMapping(current=>({...current,[key]:event.target.value}))}><option value="">Choose status…</option>{inspection.statuses.map(status=><option key={status.status} value={status.status}>{status.status}</option>)}</select></label>)}</div></fieldset>
        <p>Connecting imports existing ClickUp items assigned to this person and queues their assigned CRM work. Titles, dates and stages sync both ways. Brief details, attachments, assignments and progress stay CRM-managed. Use a distinct ClickUp status for each job stage.</p>
        <p>Tasks become subtasks when their assigned parent job is in this same list; otherwise they appear as standalone assets. Incoming subtasks need a linked parent job. Deleting a ClickUp copy never deletes the shared CRM record.</p>
        {connection&&connection.list_id!==inspection.listId?<p className="personal-clickup-warning">This pauses the previous personal list. Its existing tasks and history stay there; your new list receives separate mirrors.</p>:null}
        <button type="button" className="admin-primary-button" disabled={pending||!assignee||stages.some(([key])=>!mapping[key])} onClick={()=>act(async()=>{
          await connectPersonalClickUpList({userId:member.user_id,listUrl:url,assignedUserId:Number(assignee),mapping});setInspection(null);setNotice("Connected. Assigned work has been queued for syncing.");await onRefresh();
        })}>{pending?<LoaderCircle className="spin" size={14}/>:<Link2 size={14}/>}Connect verified list</button>
      </div>:null}
      {connection?.issues.length?<section className="personal-clickup-issues"><h4>Needs your attention</h4>{connection.issues.map(item=><article key={`${item.record_kind}:${item.record_id}`}><strong>{item.record_title||`Linked ${item.record_kind}`}</strong><p>{item.last_error}</p><div className="personal-clickup-actions"><button type="button" disabled={pending||!connection.enabled||!member.is_active} onClick={()=>act(async()=>{
        await retryPersonalClickUpItem({connectionId:connection.id,recordKind:item.record_kind,recordId:item.record_id,useCrm:false});setNotice("Safe retry queued.");await onRefresh();
      })}>Retry safely</button><button type="button" disabled={pending||!connection.enabled||!member.is_active} onClick={()=>setConfirm(item.record_id)}>Resolve versions…</button></div>
        {confirm===item.record_id?<div className="personal-clickup-confirm"><p>Keep CRM replaces the ClickUp copy, or recreates it if missing. Keep ClickUp imports its title, dates and stage; structured brief details and assignments are unchanged. A job controlled by linked assets keeps its derived stage.</p><button type="button" disabled={pending} onClick={()=>act(async()=>{await retryPersonalClickUpItem({connectionId:connection.id,recordKind:item.record_kind,recordId:item.record_id,useCrm:true});setConfirm("");setNotice("CRM version queued.");await onRefresh();})}>Keep CRM version</button><button type="button" disabled={pending} onClick={()=>act(async()=>{await retryPersonalClickUpItem({connectionId:connection.id,recordKind:item.record_kind,recordId:item.record_id,useCrm:false,useClickUp:true});setConfirm("");setNotice("ClickUp version queued for safe import.");await onRefresh();})}>Keep ClickUp title, dates & stage</button><button type="button" disabled={pending} onClick={()=>setConfirm("")}>Cancel</button></div>:null}
      </article>)}</section>:null}
      {connection?.incoming?.length?<section className="personal-clickup-issues"><h4>Incoming items to review</h4>{connection.incoming.map(item=><article key={item.remote_id}><a href={`https://app.clickup.com/t/${encodeURIComponent(item.remote_id)}`} target="_blank" rel="noreferrer">Open ClickUp item <ExternalLink size={12}/></a><p>{item.last_error}</p></article>)}<p>Fix the item’s assignment, status or parent in ClickUp, then use Sync now to retry.</p></section>:null}
      {error?<p className="personal-clickup-warning" role="alert">{error}</p>:null}{notice?<p role="status">{notice}</p>:null}
      <small>Pausing leaves ClickUp history intact. Unassigning, archiving or deleting a CRM record archives its personal mirror rather than deleting it.</small>
    </div>
  </details>;
}
