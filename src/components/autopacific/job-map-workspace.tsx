"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { ChevronRight, LocateFixed, MapPin, Search } from "lucide-react";
import { filterMapJobs, groupJobsByLocation, locationIsApproximate } from "@/lib/job-location";
import { formatDate } from "@/lib/format";
import type { JobStatus, TabletJobRecord } from "@/lib/types";
import "./job-map.css";

const MapCanvas=dynamic(()=>import("./job-map-canvas").then(m=>m.JobMapCanvas),{ssr:false,loading:()=> <div className="job-map-loading">Loading your map…</div>});
export function JobMapWorkspace({jobs,statuses,dark,onOpen}:{jobs:TabletJobRecord[];statuses:JobStatus[];dark:boolean;onOpen:(job:TabletJobRecord)=>void}) {
  const [search,setSearch]=useState("");
  const [status,setStatus]=useState("all");
  const [from,setFrom]=useState("");
  const [to,setTo]=useState("");
  const [selected,setSelected]=useState<string|null>(null);
  const [list,setList]=useState<"mapped"|"unplaced">("mapped");
  const [fit,setFit]=useState(0);
  const invalidRange=Boolean(from&&to&&from>to);
  const filtered=useMemo(()=>filterMapJobs(jobs,{search,status,from,to}),[jobs,search,status,from,to]);
  const groups=useMemo(()=>groupJobsByLocation(filtered),[filtered]);
  const mapped=useMemo(()=>new Set(groups.flatMap(group=>group.jobs.map(job=>job.id))),[groups]);
  const unplaced=filtered.filter(job=>!mapped.has(job.id));
  const pins=useMemo(()=>groups.map(group=>({id:group.id,label:group.location.label,latitude:group.location.latitude,longitude:group.location.longitude,count:group.jobs.length,approximate:locationIsApproximate(group.location)})),[groups]);
  const chosen=groups.find(group=>group.id===selected);
  const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Australia/Brisbane",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  function jobRow(job:TabletJobRecord) {
    const tone=job.status?.key==="delayed"?"delayed":job.status?.is_closed?"complete":job.due_date&&job.due_date<today?"overdue":"active";
    return <button type="button" key={job.id} className={`job-map-job is-${tone}`} onClick={()=>onOpen(job)}><span><strong>{job.title}</strong><small>{job.status?.label??"Job"} · Shoot {formatDate(job.shoot_date)} · Due {formatDate(job.due_date)}</small></span><ChevronRight size={16}/></button>;
  }
  return <div className="job-map-workspace">
    <div className="job-map-filters"><label className="job-map-search"><Search size={17}/><input aria-label="Search map jobs" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Find a job or location…"/></label><label>Status<select value={status} onChange={event=>setStatus(event.target.value)}><option value="all">All statuses</option>{statuses.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select></label><label>Shoot date from<input type="date" value={from} onChange={event=>setFrom(event.target.value)}/></label><label>To<input type="date" value={to} min={from} onChange={event=>setTo(event.target.value)}/></label>{search||status!=="all"||from||to?<button type="button" onClick={()=> {setSearch("");setStatus("all");setFrom("");setTo("");}}>Clear filters</button>:null}</div>
    {invalidRange?<p role="alert" className="job-map-warning">The finish date must be on or after the start date.</p>:null}
    <div className="job-map-layout"><div className="job-map-panel"><MapCanvas pins={pins} dark={dark} selectedId={chosen?.id} fitVersion={fit} onSelect={id=>{setSelected(id);setList("mapped");}}/><div className="job-map-toolbar"><span>{mapped.size} {mapped.size===1?"job":"jobs"} · {groups.length} {groups.length===1?"location":"locations"}</span><button type="button" onClick={()=>setFit(value=>value+1)} aria-label="Fit all job locations"><LocateFixed size={17}/>Fit all</button></div></div>
      <aside className="job-map-sidebar" aria-label="Jobs by location"><div className="job-map-list-tabs"><button type="button" aria-pressed={list==="mapped"} onClick={()=>setList("mapped")}>Locations ({groups.length})</button><button type="button" aria-pressed={list==="unplaced"} onClick={()=>setList("unplaced")}>Needs location ({unplaced.length})</button></div>
        <div className="job-map-location-list">{list==="mapped"?(chosen?<><button className="job-map-back" type="button" onClick={()=>setSelected(null)}>← All locations</button><div className="job-map-location-heading"><MapPin size={20}/><h2>{chosen.location.label}</h2></div>{locationIsApproximate(chosen.location)?<p className="job-map-note">Approximate area, not an exact venue.</p>:null}{chosen.jobs.map(jobRow)}{chosen.location.provider==="geoapify"?<small className="job-location-credit">Geoapify · {chosen.location.attribution}</small>:null}</>:groups.length?groups.map(group=><button type="button" key={group.id} className="job-map-location" onClick={()=>setSelected(group.id)}><MapPin size={20}/><span><strong>{group.location.label}</strong><small>{group.jobs.length} {group.jobs.length===1?"job":"jobs"}{locationIsApproximate(group.location)?" · Approximate area":""}</small></span><ChevronRight size={16}/></button>):<div className="job-map-empty"><MapPin size={28}/><h2>Your work, on the map</h2><p>Choose an address or drop a pin when editing a job. Current and completed jobs will appear here.</p><button type="button" onClick={()=>setList("unplaced")}>Review jobs without pins</button></div>):<><p className="job-map-note">These jobs have no confirmed pin. Open a brief and edit its location to add one. Your original text is kept.</p>{unplaced.length?unplaced.map(job=><div key={job.id} className="job-map-unplaced">{jobRow(job)}<small>{job.location||"No location yet"}</small></div>):<p className="job-map-note">All jobs in this view have locations.</p>}</>}</div>
        <p className="job-map-footnote">Includes completed work. Dates filter by shoot date, or due date if no shoot is set.</p>
      </aside></div>
  </div>;
}
