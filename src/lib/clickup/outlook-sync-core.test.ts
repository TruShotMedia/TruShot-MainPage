import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CalendarCustomEvent } from "@/lib/types";
import { ClickUpApiError, type ClickUpTask } from "./client";
import { eligibleOutlookEvents, extractOutlookMirror, outlookMirrorPayload } from "./outlook-mapping";
import { syncOutlookMirrors, type OutlookLink, type OutlookMirrorPort } from "./outlook-sync-core";

const calendarId="46cc22c6-095d-4403-8a09-945f7f70b67f";
const eventId=`outlook-${"a".repeat(32)}`;
const now=new Date("2026-11-10T00:00:00Z");
const event: CalendarCustomEvent={id:eventId,entity_type:"calendar-event",external_source:"outlook",title:"Marketing meeting",location:"Geebung",description:"PRIVATE DESCRIPTION and joining links",start_date:"2026-11-10",start_time:"09:00",end_date:"2026-11-10",end_time:"11:00",is_all_day:false,client_id:null,client_name:null,color:"blue",reminder_offsets_minutes:[],created_at:"",updated_at:""};
let links: OutlookLink[], tasks: Map<string,ClickUpTask>, port: OutlookMirrorPort;
const input=()=>({calendarId,events:[event],links,assignedUserId:42,listId:"outlook-list",openStatus:"TO DO",completeStatus:"COMPLETE",now,port});
beforeEach(()=>{
  links=[]; tasks=new Map();
  port={
    beforeRequest:vi.fn(async()=>{}),
    save:vi.fn(async(link,values)=>{Object.assign(link,values);if(!links.includes(link))links.push(link);}),
    get:vi.fn(async id=>{const task=tasks.get(id);if(!task)throw new ClickUpApiError("missing",404);return task;}),
    recover:vi.fn(async link=>[...tasks.values()].find(t=>extractOutlookMirror(t.description)?.eventId===link.event_id)??null),
    create:vi.fn(async payload=>{const task={id:`remote-${tasks.size}`,list:{id:"outlook-list"},name:String(payload.name),description:String(payload.markdown_content)};tasks.set(task.id,task);return task;}),
    update:vi.fn(async(id,payload)=>{const task=tasks.get(id)!;Object.assign(task,{...payload,description:payload.markdown_content??task.description});}),
  };
});
describe("Outlook → ClickUp bridge",()=>{
  it("publishes actual titles, locations, timestamps and only the approved fields",async()=>{
    expect(await syncOutlookMirrors(input())).toMatchObject({created:1});
    expect(port.create).toHaveBeenCalledWith(expect.objectContaining({name:"[OUTLOOK] Marketing meeting",assignees:[42],start_date:Date.parse("2026-11-09T23:00:00Z"),due_date:Date.parse("2026-11-10T01:00:00Z"),status:"TO DO"}));
    const description=tasks.get("remote-0")!.description!;
    expect(description).toContain("Geebung");expect(description).not.toContain("PRIVATE");
    expect(description).not.toContain("https://www.trushotmedia.com");
    expect(extractOutlookMirror(description)).toEqual({calendarId,eventId});
  });
  it("does no remote work on an unchanged snapshot",async()=>{
    await syncOutlookMirrors(input());vi.mocked(port.get).mockClear();vi.mocked(port.update).mockClear();
    expect(await syncOutlookMirrors(input())).toMatchObject({unchanged:1});
    expect(port.create).toHaveBeenCalledTimes(1);expect(port.get).not.toHaveBeenCalled();expect(port.update).not.toHaveBeenCalled();
  });
  it("automatically completes at the end time even when the feed never changes",async()=>{
    await syncOutlookMirrors(input());
    await syncOutlookMirrors({...input(),now:new Date("2026-11-10T01:00:00Z")});
    expect(port.update).toHaveBeenCalledWith("remote-0",expect.objectContaining({status:"COMPLETE"}));
  });
  it("keeps all-day events open until the end of their final day",()=>{
    const day={...event,is_all_day:true,start_time:null,end_time:null};
    expect(outlookMirrorPayload(day,calendarId,42,"TO DO","COMPLETE",new Date("2026-11-10T13:59:00Z")).status).toBe("TO DO");
    expect(outlookMirrorPayload(day,calendarId,42,"TO DO","COMPLETE",new Date("2026-11-10T14:00:00Z")).status).toBe("COMPLETE");
  });
  it("updates a moved appointment in place and reopens it if its end is now future",async()=>{
    await syncOutlookMirrors(input());
    await syncOutlookMirrors({...input(),now:new Date("2026-11-10T02:00:00Z")});
    await syncOutlookMirrors({...input(),events:[{...event,title:"Moved",end_time:"14:00"}],now:new Date("2026-11-10T02:00:00Z")});
    expect(port.create).toHaveBeenCalledTimes(1);
    expect(port.update).toHaveBeenLastCalledWith("remote-0",expect.objectContaining({name:"[OUTLOOK] Moved",status:"TO DO"}));
  });
  it("archives cancelled/deleted occurrences and keeps their identity",async()=>{
    await syncOutlookMirrors(input());await syncOutlookMirrors({...input(),events:[]});
    expect(port.update).toHaveBeenCalledWith("remote-0",{archived:true});expect(links[0].archived_at).not.toBeNull();
    await syncOutlookMirrors(input());expect(port.create).toHaveBeenCalledTimes(1);
    expect(port.update).toHaveBeenLastCalledWith("remote-0",expect.objectContaining({archived:false}));
  });
  it("archives remote copies after disconnect without touching any source appointment",async()=>{
    await syncOutlookMirrors(input());await syncOutlookMirrors({...input(),calendarId:null,events:[]});
    expect(port.update).toHaveBeenCalledWith("remote-0",{archived:true});
  });
  it("reserves before POST and recovers after a timeout without creating twice",async()=>{
    const create=port.create;
    port.create=vi.fn(async payload=>{expect(links[0].create_attempted_at).not.toBeNull();await create(payload);throw new Error("timeout");});
    await expect(syncOutlookMirrors(input())).rejects.toThrow("timeout");
    await syncOutlookMirrors(input());expect(port.create).toHaveBeenCalledTimes(1);expect(port.recover).toHaveBeenCalled();
    expect(links[0].clickup_task_id).toBe("remote-0");
  });
  it("does not blindly repeat an unconfirmed create",async()=>{
    port.create=vi.fn(async()=>{throw new Error("timeout");});
    await expect(syncOutlookMirrors(input())).rejects.toThrow("timeout");
    await expect(syncOutlookMirrors(input())).rejects.toThrow("No duplicate");expect(port.create).toHaveBeenCalledTimes(1);
  });
  it("can retry a known rejected create",async()=>{
    port.create=vi.fn(async()=>{throw new ClickUpApiError("rate limited",429);});
    await expect(syncOutlookMirrors(input())).rejects.toThrow();expect(links[0].create_attempted_at).toBeNull();
  });
  it("never edits a remote task moved to another list or stripped of its identity",async()=>{
    await syncOutlookMirrors(input());tasks.get("remote-0")!.list={id:"other-list"};
    await expect(syncOutlookMirrors({...input(),events:[{...event,title:"Changed"}]})).rejects.toThrow("moved");
    expect(port.update).not.toHaveBeenCalled();
  });
  it("does not backfill a year of past meetings, but retains previously mirrored ones",()=>{
    const past={...event,end_date:"2026-10-01"};
    expect(eligibleOutlookEvents([past],new Set(),now)).toHaveLength(0);
    expect(eligibleOutlookEvents([past],new Set([past.id]),now)).toHaveLength(1);
  });
  it("stops before publishing when the shared lease/deadline is lost",async()=>{
    port.beforeRequest=vi.fn(async()=>{throw new Error("lease lost");});
    await expect(syncOutlookMirrors(input())).rejects.toThrow("lease lost");expect(port.create).not.toHaveBeenCalled();
  });
});
