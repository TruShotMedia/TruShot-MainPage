import { beforeEach,expect,it,vi } from "vitest";
const mocks=vi.hoisted(()=>({client:vi.fn(),owner:vi.fn(),token:vi.fn(),list:vi.fn(),sync:vi.fn()}));
vi.mock("@/lib/supabase/service",()=>({createServiceClient:mocks.client}));
vi.mock("./assignment-scope",()=>({assignedToClickUpOwner:mocks.owner}));
vi.mock("./config",()=>({getClickUpToken:mocks.token}));
vi.mock("./client",async original=>({...await original<typeof import("./client")>(),getClickUpList:mocks.list}));
vi.mock("./outlook-sync-core",()=>({syncOutlookMirrors:mocks.sync}));
import {dispatchOutlookClickUpSync,readOutlookBridgeStatus} from "./outlook-sync";
const bridge={user_id:"owner",list_id:"outlook-list",enabled:true,failure_count:0};
const calendar={id:"calendar",events:[],source_format_version:2,last_success_at:"now"};
function db(results:unknown[]){
  const calls:unknown[][]=[];
  return {calls,from:(table:string)=>{const result=results.shift();const chain:Record<string,unknown>={};for(const method of ["select","eq","maybeSingle","update","upsert","order","range"])chain[method]=(...args:unknown[])=>{calls.push([table,method,...args]);return chain;};chain.then=(resolve:(value:unknown)=>unknown)=>Promise.resolve(result).then(resolve);return chain;},rpc:vi.fn(async()=>({data:true,error:null}))};
}
beforeEach(()=>{vi.clearAllMocks();mocks.token.mockReturnValue("configured");mocks.owner.mockResolvedValue(true);mocks.list.mockResolvedValue({id:"outlook-list",statuses:[{status:"TO DO",type:"open"},{status:"COMPLETE",type:"closed"}]});mocks.sync.mockResolvedValue({created:1,updated:0,archived:0,unchanged:0});});
it("does nothing without credentials or an explicitly enabled owner/destination",async()=>{
  mocks.client.mockReturnValue(null);expect(await dispatchOutlookClickUpSync()).toEqual({status:"not-configured"});
  const service=db([{data:null}]);mocks.client.mockReturnValue(service);expect(await dispatchOutlookClickUpSync()).toEqual({status:"disabled"});expect(service.rpc).not.toHaveBeenCalled();expect(mocks.list).not.toHaveBeenCalled();
});
it("scopes browser-triggered reads and dispatch to the authenticated owner",async()=>{
  const service=db([{data:null},{data:null}]);mocks.client.mockReturnValue(service);await readOutlookBridgeStatus("verified-owner");await dispatchOutlookClickUpSync("verified-owner");
  expect(service.calls.filter(c=>c[1]==="eq"&&c[2]==="user_id")).toEqual(expect.arrayContaining([["website-clickup-outlook-bridge","eq","user_id","verified-owner"]]));
});
it("waits for a v2 complete snapshot rather than creating unstable duplicates",async()=>{
  const service=db([{data:bridge},{data:{enabled:true,assigned_user_id:42}},{data:{...calendar,source_format_version:1}},{error:null}]);mocks.client.mockReturnValue(service);
  expect(await dispatchOutlookClickUpSync()).toEqual({status:"pending"});expect(mocks.list).not.toHaveBeenCalled();expect(mocks.sync).not.toHaveBeenCalled();
});
it("uses the separate destination and derives its own open/closed statuses",async()=>{
  const service=db([{data:bridge},{data:{enabled:true,assigned_user_id:42}},{data:calendar},{data:[]},{error:null}]);mocks.client.mockReturnValue(service);
  expect(await dispatchOutlookClickUpSync()).toMatchObject({status:"completed",created:1});
  expect(mocks.list).toHaveBeenCalledWith("outlook-list");expect(mocks.sync).toHaveBeenCalledWith(expect.objectContaining({calendarId:"calendar",listId:"outlook-list",assignedUserId:42,openStatus:"TO DO",completeStatus:"COMPLETE"}));
  expect(service.calls.some(c=>c[1]==="select"&&String(c[2]).includes("encrypted_url"))).toBe(false);
  expect(service.rpc).toHaveBeenLastCalledWith("website-clickup-outlook-lease",expect.objectContaining({p_action:"release"}));
});
it("fails closed if the configured owner is not the active ClickUp owner",async()=>{
  const service=db([{data:bridge},{data:{enabled:true,assigned_user_id:42}},{error:null}]);mocks.client.mockReturnValue(service);mocks.owner.mockResolvedValue(false);
  expect(await dispatchOutlookClickUpSync()).toEqual({status:"unavailable"});expect(mocks.list).not.toHaveBeenCalled();expect(mocks.sync).not.toHaveBeenCalled();
});
it("retains cleanup mappings when the Outlook connection has been removed",async()=>{
  const service=db([{data:bridge},{data:{enabled:true,assigned_user_id:42}},{data:null},{data:[{calendar_id:"old"}]},{error:null}]);mocks.client.mockReturnValue(service);
  await dispatchOutlookClickUpSync();expect(mocks.sync).toHaveBeenCalledWith(expect.objectContaining({calendarId:null,events:[],links:[{calendar_id:"old"}]}));
});
