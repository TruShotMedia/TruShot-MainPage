// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync, writeFileSync } from "node:fs";
import { describe,expect,it,vi } from "vitest";
import { ProductionDesktop } from "./production-desktop";
import { TabletRecordEditEditor } from "@/components/tablet/tablet-workspace-editors";
import type { TabletKioskData,TabletJobRecord } from "@/lib/types";
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:vi.fn()})}));
// eslint-disable-next-line @next/next/no-img-element -- Native image stub for component/layout tests only.
vi.mock("next/image",()=>({default:({alt,src,...props}:{alt:string;src:string})=><img alt={alt} src={src} {...props}/> }));
vi.mock("next/link",()=>({default:({href,children}:{href:string;children:ReactNode})=><a href={href}>{children}</a>}));
vi.mock("next/dynamic",()=>({default:()=>()=>null}));
vi.mock("@/components/admin/notion-auto-sync",()=>({NotionAutoSync:()=>null}));
vi.mock("@/components/shared/calendar-weather",()=>({useCalendarWeather:()=>({days:[],unavailable:false}),CalendarWeatherBadge:()=>null,CalendarWeatherCredit:()=>null,CalendarWeatherDetails:()=>null,WeatherIcon:()=>null}));
vi.mock("@/app/admin/actions",()=>({movePipelineTask:vi.fn(),bulkUpdateJobStatus:vi.fn(),createDeliverableTasks:vi.fn(),updateTabletJob:vi.fn(),saveWorkRecordNote:vi.fn()}));
vi.mock("@/app/autopacific/brief-actions",()=>({loadJobSupportingData:vi.fn(async()=>({attachments:[],linkedTasks:[]})),loadJobBriefHistory:vi.fn(async()=>[]),approveProductionTask:vi.fn()}));
const statuses=[{id:"plan",key:"planning",label:"Planning",color:"#7c8790",position:1,is_closed:false},{id:"scheduled",key:"scheduled",label:"Scheduled",color:"#5d91b0",position:2,is_closed:false},{id:"production",key:"production",label:"Production",color:"#5d91b0",position:3,is_closed:false},{id:"review",key:"review",label:"Review",color:"#795e93",position:4,is_closed:false},{id:"done",key:"delivered",label:"Delivered",color:"#397253",position:5,is_closed:true}];
const job:TabletJobRecord={id:"11111111-2222-4333-8444-555555555555",title:"Rola launch content",job_number:null,client_id:"apg",status_id:"scheduled",shoot_date:"2026-11-10",shoot_time:"09:00",shoot_end_time:"11:00",due_date:"2026-11-13",due_time:"17:00",photos_delivered:0,description:"Capture the product range in a real workshop.",notes:null,location:"Geebung workshop",delivery_url:null,delivered_at:null,updated_at:"2026-10-27T00:00:00.000Z",open_tasks:1,total_tasks:2,status:statuses[1],client:{id:"apg",name:"Autopacific Group"},brief_details:{objective:"Show practical use of the new range",audience:"Trade customers",sections:[{key:"output_specs",body:"9:16 social reel, 30 seconds · MP4"}]},deliverables:[{id:"22222222-3333-4444-8555-666666666666",name:"Product launch reel",date:"2026-11-13"},{id:"33333333-4444-4555-8666-777777777777",name:"Workshop photographs",date:null}]};
const data:TabletKioskData={statuses:[{id:"todo",key:"not_started",label:"Not started",color:"#777",position:1,is_open:true},{id:"progress",key:"in_progress",label:"In progress",color:"#579",position:2,is_open:true},{id:"review",key:"final_draft_notes",label:"Final Draft/Notes",color:"#795",position:3,is_open:true},{id:"posted",key:"posted_done",label:"Posted / Done",color:"#375",position:4,is_open:false}],jobStatuses:statuses,clientOptions:[{id:"apg",name:"Autopacific Group"}],jobOptions:[],pipelineJobs:[job,{...job,id:"draft",title:"Undated planning brief",status_id:"plan",status:statuses[0],shoot_date:null,due_date:null}],pipelineTasks:[{id:"task",job_id:job.id,title:"Launch reel",status_id:"review",asset_type:"Asset",hours:2,due_date:"2026-11-13",due_time:null,priority:"normal",description:null,position:10,completed_at:null,updated_at:job.updated_at,job:{title:job.title,client:{name:"Autopacific Group"}}}],calendarJobs:[{...job,entity_type:"job",client_name:"Autopacific Group",status_label:"Scheduled",status_color:"#579",is_complete:false}],calendarTasks:[],calendarCampaignAssets:[],calendarEvents:[],flightEvents:[],pendingRequestCount:0};
describe("shared desktop workspace",()=>{
 it("gives Marketing only three tabs and review-only task actions",async()=>{
  (globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  vi.stubGlobal("fetch",vi.fn(async()=>({status:304})));const container=document.createElement("div");document.body.append(container);const root=createRoot(container);
  try{await act(async()=>root.render(<ProductionDesktop data={data} mode="marketing" initialView="jobs" today="2026-11-10" refreshIntervalMinutes={15} notificationPublicKey=""/>));
    expect([...container.querySelectorAll("nav button")].map(button=>button.textContent)).toEqual(["Jobs","Tasks","Calendar"]);
    expect(document.title).toBe("Jobs | AutoPacific Marketing");
    expect(container.textContent).not.toContain("Undated planning brief");
    await act(async()=>[...container.querySelectorAll<HTMLButtonElement>("button")].find(button=>button.textContent==="Planning")!.click());expect(container.textContent).toContain("Undated planning brief");
    expect(document.title).toBe("Planning | AutoPacific Marketing");
    await act(async()=>[...container.querySelectorAll<HTMLButtonElement>("nav button")].find(button=>button.textContent==="Tasks")!.click());
    expect(container.querySelector('.drag-handle,.tablet-card-edit-button,.tablet-card-duplicate-button')).toBeNull();expect(container.querySelector('[aria-label="Approve and complete Launch reel"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Search tasks"]')).not.toBeNull();
    expect(document.title).toBe("Tasks | AutoPacific Marketing");
  }finally{await act(async()=>root.unmount());container.remove();vi.unstubAllGlobals();}
 });
 it("opens a brief from a stable deep link",()=>{const html=renderToStaticMarkup(<ProductionDesktop data={data} mode="production" initialView="jobs" requestedJobId={job.id} today="2026-11-10" refreshIntervalMinutes={15} notificationPublicKey=""/>);expect(html).toContain("Edit full brief");expect(html).toContain("desktop-brief-panel");});
 it("opens the day agenda when switching from Calendar to Today",async()=>{
  (globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  vi.stubGlobal("fetch",vi.fn(async()=>({status:304})));const container=document.createElement("div");document.body.append(container);const root=createRoot(container);
  try{
   await act(async()=>root.render(<ProductionDesktop data={data} mode="production" initialView="calendar" today="2026-11-10" refreshIntervalMinutes={15} notificationPublicKey=""/>));
   expect(container.querySelector('[aria-label="Production calendar"]')).not.toBeNull();
   await act(async()=>[...container.querySelectorAll<HTMLButtonElement>("nav button")].find(button=>button.textContent==="Today")!.click());
   expect(container.querySelector('[aria-label="Day schedule"]')).not.toBeNull();
   expect(container.querySelector('[aria-label="Production calendar"]')).toBeNull();
  }finally{await act(async()=>root.unmount());container.remove();vi.unstubAllGlobals();}
 });
 it("merges overlapping tab refreshes without discarding either response",async()=>{
  (globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  type TabResponse={status:number;ok:boolean;json:()=>Promise<unknown>;headers:Headers};
  const pending:Array<(response:TabResponse)=>void>=[];
  vi.stubGlobal("fetch",vi.fn().mockImplementationOnce(()=>new Promise<TabResponse>(resolve=>pending.push(resolve))).mockImplementationOnce(()=>new Promise<TabResponse>(resolve=>pending.push(resolve))).mockResolvedValue({status:304}));
  const container=document.createElement("div");document.body.append(container);const root=createRoot(container);
  try{
   await act(async()=>root.render(<ProductionDesktop data={data} mode="marketing" initialView="jobs" today="2026-11-10" refreshIntervalMinutes={15} notificationPublicKey=""/>));
   await act(async()=>container.querySelector<HTMLButtonElement>('[aria-label="Refresh current page"]')!.click());
   await act(async()=>[...container.querySelectorAll<HTMLButtonElement>("nav button")].find(button=>button.textContent==="Tasks")!.click());
   const response=(payload:unknown):TabResponse=>({status:200,ok:true,json:async()=>payload,headers:new Headers()});
   await act(async()=>{
    pending[0](response({pipelineJobs:[{...job,title:"Refreshed brief",updated_at:"2026-10-27T01:00:00.000Z"}]}));
    pending[1](response({pipelineTasks:[{...data.pipelineTasks[0],title:"Refreshed asset",updated_at:"2026-10-27T01:00:00.000Z"}]}));
   });
   expect(container.textContent).toContain("Refreshed asset");
   await act(async()=>[...container.querySelectorAll<HTMLButtonElement>("nav button")].find(button=>button.textContent==="Jobs")!.click());
   expect(container.textContent).toContain("Refreshed brief");
  }finally{await act(async()=>root.unmount());container.remove();vi.unstubAllGlobals();}
 });
 it("renders reviewable browser fixtures without exposing an authenticated test route",()=>{
  if(process.env.APG_RENDER_PREVIEWS!=="1")return;
  const css=["src/app/globals.css","src/app/workspace.css","src/components/autopacific/production-desktop.css"].map(path=>readFileSync(path,"utf8")).join("\n");
  const views={jobs:<ProductionDesktop data={data} mode="production" initialView="jobs" today="2026-11-10" refreshIntervalMinutes={15} notificationPublicKey=""/>,brief:<ProductionDesktop data={data} mode="production" initialView="jobs" requestedJobId={job.id} today="2026-11-10" refreshIntervalMinutes={15} notificationPublicKey=""/>,editor:<main className="apg-desktop is-light theme-autopacific"><TabletRecordEditEditor record={job} type="job" fixedClientId="apg" clientOptions={data.clientOptions} jobOptions={[]} jobStatuses={statuses} taskStatuses={data.statuses} onClose={()=>{}} onSaved={()=>{}} /></main>,calendar:<ProductionDesktop data={data} mode="production" initialView="calendar" today="2026-11-10" refreshIntervalMinutes={15} notificationPublicKey=""/>,today:<ProductionDesktop data={data} mode="production" initialView="today" today="2026-11-10" refreshIntervalMinutes={15} notificationPublicKey=""/>};
  for(const [key,view] of Object.entries(views))writeFileSync(`/private/tmp/apg-desktop-${key}.html`,`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body>${renderToStaticMarkup(view)}</body></html>`);
 });
});
