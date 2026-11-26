import { describe,expect,it } from "vitest";
import { layoutTimedBlocks,productionDayAgenda } from "./production-agenda";
import type { CalendarCustomEvent,CalendarJob,CalendarTask } from "./types";
const job:CalendarJob={id:"job",entity_type:"job",title:"Product shoot",client_name:"Autopacific Group",shoot_date:"2026-11-10",shoot_time:"09:00",shoot_end_time:"11:00",due_date:"2026-11-13",due_time:"17:00",status_label:"Scheduled",status_color:"#579",is_complete:false};
const event = (id: string, start: string, end: string): CalendarCustomEvent => ({
  id, title: id, entity_type: "calendar-event", client_id: null, client_name: job.client_name, start_date: job.shoot_date!, end_date: job.shoot_date!,
  start_time: start, end_time: end, is_all_day: false, location: null, description: null, color: "#397fa6", reminder_offsets_minutes: [], created_at: "", updated_at: "",
});
describe("production timetable",()=>{
 it("uses the shoot finish, never the delivery deadline, as the booking end",()=>{const day=productionDayAgenda("2026-11-10",{jobs:[job],tasks:[],events:[],flights:[]});expect(day.timed[0]).toMatchObject({start:540,end:660});expect(day.allDay).toHaveLength(0);});
 it("does not invent a multi-day booking for a missing shoot finish",()=>{const day=productionDayAgenda("2026-11-10",{jobs:[{...job,shoot_end_time:null}],tasks:[],events:[],flights:[]});expect(day.timed[0].detail).toContain("finish time not set");expect(day.timed[0].end-day.timed[0].start).toBe(30);});
 it("keeps task deadlines out of occupied time slots",()=>{const task:CalendarTask={id:"task",entity_type:"task",title:"Reel",client_name:"Autopacific Group",job_title:"Shoot",due_date:"2026-11-10",due_time:"17:00",priority:"normal",status_label:"In progress",status_color:"#579",is_complete:false};const day=productionDayAgenda("2026-11-10",{jobs:[],tasks:[task],events:[],flights:[]});expect(day.timed).toHaveLength(0);expect(day.allDay[0].detail).toContain("17:00");});
 it("puts overlaps in separate lanes and resets lanes for later bookings",()=>{const item={title:"Meeting",time:"",detail:"",source:job};const blocks=layoutTimedBlocks([{...item,id:"one",start:540,end:600},{...item,id:"two",start:570,end:630},{...item,id:"three",start:720,end:780}]);expect(blocks.map(block=>[block.lane,block.lanes])).toEqual([[0,2],[1,2],[0,1]]);});

 it("gives back-to-back CRM and Outlook bookings their true duration and full width", () => {
   const agenda = productionDayAgenda("2026-11-10", {
     jobs: [{ ...job, shoot_time: "13:20", shoot_end_time: "13:30:00" }], tasks: [], flights: [],
     events: [{ ...event("Outlook", "13:30", "13:40"), external_source: "outlook" }, event("Next event", "13:40:00", "14:00:00")],
   });
   expect(agenda.timed.map(({ start, end, lane, lanes }) => [start, end, lane, lanes])).toEqual([
     [800, 810, 0, 1], [810, 820, 0, 1], [820, 840, 0, 1],
   ]);
 });

 it("counts a real overlap even when events display the same boundary minute", () => {
   const agenda = productionDayAgenda("2026-11-10", { jobs: [], tasks: [], flights: [],
     events: [event("First", "13:20", "13:30:30"), event("Second", "13:30", "14:00")],
   });
   expect(agenda.timed.map(({ end, lane, lanes }) => [end, lane, lanes])).toEqual([[810.5, 0, 2], [840, 1, 2]]);
 });

 it("widens a later booking into lanes that were only busy earlier", () => {
   const base = { title: "Meeting", time: "", detail: "", source: job };
   const blocks = layoutTimedBlocks([
     { ...base, id: "long", start: 540, end: 780 },
     { ...base, id: "first", start: 570, end: 600 },
     { ...base, id: "overlapping", start: 585, end: 600 },
     { ...base, id: "next", start: 600, end: 660 },
     { ...base, id: "after all", start: 780, end: 810 },
   ]);
   expect(blocks.map(({ lane, lanes, span }) => [lane, lanes, span])).toEqual([[0, 3, 1], [1, 3, 1], [2, 3, 1], [1, 3, 2], [0, 1, 1]]);
 });

 it("does not reserve a phantom slot on the next day for a midnight finish", () => {
   const agenda = productionDayAgenda("2026-11-10", { jobs: [], tasks: [], flights: [], events: [
     { ...event("Late booking", "23:30", "00:00:00"), start_date: "2026-11-09" }, event("Midnight booking", "00:00", "00:15"),
   ] });
   expect(agenda.timed.map(({ id, lanes }) => [id, lanes])).toEqual([["Midnight booking", 1]]);
 });
});
