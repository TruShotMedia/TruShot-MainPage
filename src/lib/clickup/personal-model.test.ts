import {describe,expect,it} from "vitest";
import {containsCrmIdentity,decidePersonalInbound,ownsPersonalMirror,parsePersonalListUrl,personalMarker,personalPayloadShared,personalSharedState,suggestedPersonalStatuses} from "./personal-model";
const url="https://app.clickup.com/9003084068/v/l/li/123456";
const state={title:"Job",status:"SCHEDULED",shoot_date:"2026-11-11",shoot_time:null,due_date:null,due_time:null};
describe("personal connection boundaries",()=>{
  it("normalises only a verified workspace list URL, stripping optional tracking",()=>expect(parsePersonalListUrl(`${url}?pr=1#view`)).toEqual({listId:"123456",url}));
  it.each(["https://app.clickup.com/9003084068/v/l/li/1300350000002054","https://app.clickup.com/9003084068/v/l/li/1300350000012117","http://app.clickup.com/9003084068/v/l/li/123","https://evil.test/9003084068/v/l/li/123","https://app.clickup.com.evil.test/9003084068/v/l/li/123","https://app.clickup.com/other/v/l/li/123","https://user:password@app.clickup.com/9003084068/v/l/li/123","https://app.clickup.com:8080/9003084068/v/l/li/123","https://app.clickup.com/9003084068/home"])("rejects unsafe or reserved destination %s",value=>expect(()=>parsePersonalListUrl(value)).toThrow());
  it("does not guess unmatched statuses",()=>expect(suggestedPersonalStatuses([{status:"SCHEDULED"},{status:"DONE",type:"closed"}])).toMatchObject({scheduled:"SCHEDULED",delivered:"DONE",review:""}));
  it("scopes remote ownership to connection, list, record, kind and generation",()=>{
    const task={id:"remote",list:{id:"123"},description:personalMarker("connection","job","record",1)};
    expect(ownsPersonalMirror(task,{id:"connection",list_id:"123"},"job","record",1)).toBe(true);
    expect(ownsPersonalMirror(task,{id:"other",list_id:"123"},"job","record",1)).toBe(false);
    expect(ownsPersonalMirror(task,{id:"connection",list_id:"elsewhere"},"job","record",1)).toBe(false);
    expect(ownsPersonalMirror(task,{id:"connection",list_id:"123"},"task","record",1)).toBe(false);
    expect(ownsPersonalMirror(task,{id:"connection",list_id:"123"},"job","record",2)).toBe(false);
    expect(containsCrmIdentity(task)).toBe(true);
  });
});
describe("two-way shared field policy",()=>{
  it("imports remote-only changes and treats JSONB key order as irrelevant",()=>expect(decidePersonalInbound({baseline:Object.fromEntries(Object.entries(state).reverse()) as typeof state,current:state,remote:{...state,title:"Changed"}})).toBe("apply"));
  it("does not echo identical remote/CRM states or regress pending local work",()=>{expect(decidePersonalInbound({baseline:state,current:{...state,title:"Local"},remote:state})).toBe("unchanged");expect(decidePersonalInbound({baseline:state,current:{...state,title:"Same"},remote:{...state,title:"Same"}})).toBe("unchanged");});
  it("requires review for divergent edits and preserves derived job stages",()=>{expect(decidePersonalInbound({baseline:state,current:{...state,title:"CRM"},remote:{...state,title:"ClickUp"}})).toBe("conflict");expect(decidePersonalInbound({baseline:state,current:state,remote:{...state,status:"COMPLETE"},derivedJobStatus:true})).toBe("derived-status");});
  it("waits for an uncertain outbound identity before accepting incoming changes",()=>expect(decidePersonalInbound({baseline:null,current:state,remote:state})).toBe("wait"));
  it("retains date-only semantics and excludes inherited task start dates",()=>{
    expect(personalSharedState("job",{id:"a",name:"Job",status:{status:"scheduled"},start_date:String(Date.parse("2026-11-10T14:00:00Z"))},state)).toMatchObject({shoot_date:"2026-11-11",shoot_time:null});
    expect(personalPayloadShared("task",{name:"Asset",status:"APPROVAL",start_date:123,due_date:null})).toMatchObject({title:"Asset",shoot_date:null,shoot_time:null});
  });
});
