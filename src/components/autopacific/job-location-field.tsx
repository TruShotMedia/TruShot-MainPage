"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Check, MapPin, Search, X } from "lucide-react";
import { locationIsApproximate, readJobLocation, type JobLocation } from "@/lib/job-location";
import "./job-map.css";

const MapCanvas=dynamic(()=>import("./job-map-canvas").then(m=>m.JobMapCanvas),{ssr:false,loading:()=> <div className="job-map-loading">Loading map…</div>});
export function JobLocationField({initialText,initialLocation,onValueChange}:{initialText?:string|null;initialLocation?:JobLocation|null;onValueChange?:(text:string,location:JobLocation|null)=>void}) {
  const id=useId();
  const root=useRef<HTMLDivElement>(null);
  const [text,setText]=useState(initialText??"");
  const [location,setLocation]=useState(()=>initialLocation?.label===initialText ? readJobLocation(initialLocation) : null);
  const [results,setResults]=useState<JobLocation[]>([]);
  const [open,setOpen]=useState(false);
  const [active,setActive]=useState(-1);
  const [edited,setEdited]=useState(false);
  const [loading,setLoading]=useState(false);
  const [message,setMessage]=useState("");
  const [picking,setPicking]=useState(false);
  // Campaign planners may contain hundreds of collapsed job editors. Do not
  // allocate a WebGL map for every saved location until its preview is opened.
  const [showMap,setShowMap]=useState(false);
  const [dark,setDark]=useState(false);
  useEffect(()=> {
    const surface=root.current?.closest(".is-dark,.is-light");
    if(!surface) return;
    const update=()=>setDark(surface.classList.contains("is-dark"));
    update();
    const observer=new MutationObserver(update);
    observer.observe(surface,{attributes:true,attributeFilter:["class"]});
    return ()=>observer.disconnect();
  },[]);
  useEffect(()=> {
    if (!edited || !open || location || text.trim().length<3 || text.trim().length>200) return;
    const controller=new AbortController();
    const timer=setTimeout(async()=> {
      setLoading(true);setMessage("");
      try {
        const response=await fetch(`/api/autopacific/locations?q=${encodeURIComponent(text.trim())}`,{signal:controller.signal,cache:"no-store"});
        const payload=await response.json();
        if (controller.signal.aborted) return;
        if (!response.ok) throw new Error(payload.error??"Search is unavailable. You can still enter a location.");
        const found=Array.isArray(payload.results)?payload.results.map(readJobLocation).filter((item:JobLocation|null):item is JobLocation=>Boolean(item)):[];
        setResults(found);
        if(!found.length) setMessage("No matching locations. Try a suburb or street, or drop a pin.");
        setActive(-1);
      } catch(error) {
        if (!controller.signal.aborted) {setResults([]);setMessage(error instanceof Error?error.message:"Search is unavailable. Keep your typed location or drop a pin.");}
      } finally {if(!controller.signal.aborted) setLoading(false);}
    },450);
    return ()=> {clearTimeout(timer);controller.abort();setLoading(false);};
  },[edited,location,open,text]);
  useEffect(()=> {
    const dismiss=(event:PointerEvent)=> {if (!root.current?.contains(event.target as Node)) setOpen(false);};
    document.addEventListener("pointerdown",dismiss);
    return ()=>document.removeEventListener("pointerdown",dismiss);
  },[]);
  const pins=useMemo(()=>location?[{id:"chosen",latitude:location.latitude,longitude:location.longitude,label:location.label,count:1,approximate:locationIsApproximate(location)}]:[],[location]);
  function choose(value:JobLocation) {setLocation(value);setText(value.label);setOpen(false);setResults([]);setShowMap(true);setPicking(false);setMessage("");onValueChange?.(value.label,value);}
  return <div ref={root} className="job-location-field form-span">
    <label htmlFor={id}>Location</label>
    <div className="job-location-input"><Search size={17} aria-hidden="true"/><input id={id} name="location" value={text} maxLength={300} placeholder="Search an address or place…" autoComplete="off" role="combobox" aria-autocomplete="list" aria-expanded={open&&results.length>0} aria-controls={`${id}-results`} aria-activedescendant={active>=0?`${id}-${active}`:undefined} aria-describedby={`${id}-hint`} onFocus={()=>setOpen(true)} onBlur={event=> {if(!event.currentTarget.parentElement?.parentElement?.contains(event.relatedTarget)) setOpen(false);}} onChange={event=> {setText(event.target.value);setLocation(null);setResults([]);setActive(-1);setEdited(true);setOpen(true);setMessage("");onValueChange?.(event.target.value,null);}} onKeyDown={event=> {
      if(event.key==="Escape"&&open){event.preventDefault();event.stopPropagation();setOpen(false);}
      if(event.key==="ArrowDown"&&results.length){event.preventDefault();setOpen(true);setActive(value=>(value+1)%results.length);}
      if(event.key==="ArrowUp"&&results.length){event.preventDefault();setActive(value=>(value+results.length-1)%results.length);}
      if(event.key==="Enter"&&open&&active>=0&&results[active]){event.preventDefault();choose(results[active]);}
    }}/>{location?<Check size={17} aria-label="Location pinned"/>:null}{text?<button type="button" aria-label="Clear location" onClick={()=> {setText("");setLocation(null);setResults([]);setMessage("");setEdited(false);onValueChange?.("",null);}}><X size={16}/></button>:null}</div>
    <input type="hidden" name="location_details" value={location?JSON.stringify(location):""}/>
    {open&&results.length>0?<ul className="job-location-results" id={`${id}-results`} role="listbox" aria-label="Matching locations">{results.map((result,index)=><li key={result.placeId??`${result.latitude},${result.longitude}`} role="option" id={`${id}-${index}`} aria-selected={active===index} onPointerDown={event=>event.preventDefault()} onClick={()=>choose(result)}><MapPin size={17}/><span>{result.label}{locationIsApproximate(result)?<small>Approximate area</small>:null}</span></li>)}</ul>:null}
    <div className="job-location-tools"><small id={`${id}-hint`}>{location?(locationIsApproximate(location)?"Approximate area · not an exact venue":"Pinned on your job map"):"Choose a result to pin it, or keep a text-only location."}</small><button type="button" onClick={()=>{setPicking(value=>!value);setShowMap(true);setOpen(false);}}><MapPin size={14}/>{picking?"Cancel pin":"Drop a pin"}</button>{showMap&&!picking?<button type="button" onClick={()=>setShowMap(false)}>Hide map</button>:null}{!showMap&&location?<button type="button" onClick={()=>setShowMap(true)}>Show map</button>:null}</div>
    <p className="job-location-status" role="status">{loading?"Searching locations…":message}</p>
    {showMap?<div className="job-location-preview">{picking?<p>Tap the map to place your pin. Keep the location’s name in the field above.</p>:null}<MapCanvas pins={pins} dark={dark} selectedId={location?"chosen":null} picking={picking} onPick={(latitude,longitude)=>choose({version:1,label:text.trim()||"Pinned location",latitude,longitude,provider:"manual",precision:"manual",attribution:"Manually placed pin"})}/></div>:null}
    {location?.provider==="geoapify"||results.length>0?<small className="job-location-credit">Search by <a href="https://www.geoapify.com/" target="_blank" rel="noreferrer">Geoapify</a> · {location?.attribution??"OpenStreetMap contributors · OpenAddresses · GeoNames"}</small>:null}
  </div>;
}
