import { describe,expect,it } from "vitest";
import { layoutTimedBlocks,productionDayAgenda } from "./production-agenda";
import type { CalendarJob,CalendarTask } from "./types";
const job:CalendarJob={id:"job",entity_type:"job",title:"Product shoot",client_name:"Autopacific Group",shoot_date:"2026-11-10",shoot_time:"09:00",shoot_end_time:"11:00",due_date:"2026-11-13",due_time:"17:00",status_label:"Scheduled",status_color:"#579",is_complete:false};
describe("production timetable",()=>{
 it("uses the shoot finish, never the delivery deadline, as the booking end",()=>{const day=productionDayAgenda("2026-11-10",{jobs:[job],tasks:[],events:[],flights:[]});expect(day.timed[0]).toMatchObject({start:540,end:660});expect(day.allDay).toHaveLength(0);});
 it("does not invent a multi-day booking for a missing shoot finish",()=>{const day=productionDayAgenda("2026-11-10",{jobs:[{...job,shoot_end_time:null}],tasks:[],events:[],flights:[]});expect(day.timed[0].detail).toContain("finish time not set");expect(day.timed[0].end-day.timed[0].start).toBe(30);});
 it("keeps task deadlines out of occupied time slots",()=>{const task:CalendarTask={id:"task",entity_type:"task",title:"Reel",client_name:"Autopacific Group",job_title:"Shoot",due_date:"2026-11-10",due_time:"17:00",priority:"normal",status_label:"In progress",status_color:"#579",is_complete:false};const day=productionDayAgenda("2026-11-10",{jobs:[],tasks:[task],events:[],flights:[]});expect(day.timed).toHaveLength(0);expect(day.allDay[0].detail).toContain("17:00");});
 it("puts overlaps in separate lanes and resets lanes for later bookings",()=>{const item={title:"Meeting",time:"",detail:"",source:job};const blocks=layoutTimedBlocks([{...item,id:"one",start:540,end:600},{...item,id:"two",start:570,end:630},{...item,id:"three",start:720,end:780}]);expect(blocks.map(block=>[block.lane,block.lanes])).toEqual([[0,2],[1,2],[0,1]]);});
});
