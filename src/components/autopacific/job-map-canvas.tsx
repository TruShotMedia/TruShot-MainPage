"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as LibreMap, GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

export type JobMapPin = { id: string; latitude: number; longitude: number; label: string; count: number; approximate?: boolean };
type Props = { pins: JobMapPin[]; selectedId?: string | null; dark?: boolean; fitVersion?: number; picking?: boolean; onSelect?: (id: string) => void; onPick?: (latitude: number, longitude: number) => void };
const styleUrl = (dark?: boolean) => `https://tiles.openfreemap.org/styles/${dark ? "dark" : "positron"}`;
function featureData(pins: JobMapPin[]) {
  return { type: "FeatureCollection" as const, features: pins.map(pin => ({ type: "Feature" as const, geometry: { type: "Point" as const, coordinates: [pin.longitude,pin.latitude] }, properties: { id: pin.id, count: pin.count, label: pin.label } })) };
}
function fitPins(map: LibreMap, pins: JobMapPin[]) {
  if (!pins.length) return;
  const points = pins.map(pin => [pin.longitude,pin.latitude] as [number,number]);
  const bounds: [[number,number],[number,number]] = [[Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1]))],[Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))]];
  map.fitBounds(bounds,{padding:55,maxZoom:pins.length===1 && pins[0].approximate ? 10 : 14,duration:0});
}

/** Maps are optional progressive enhancement; the job list remains usable without WebGL. */
export function JobMapCanvas(props: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<LibreMap | null>(null);
  const latest = useRef(props);
  const [error,setError] = useState("");
  const [ready,setReady] = useState(false);
  useEffect(() => { latest.current=props; });
  useEffect(() => {
    let cancelled=false;
    let resize: ResizeObserver | undefined;
    import("maplibre-gl").then(lib => {
      if (cancelled || !container.current) return;
      lib.setWorkerUrl(`/vendor/maplibre/${lib.getVersion()}/worker.mjs`);
      const instance = new lib.Map({container:container.current,style:styleUrl(latest.current.dark),center:[134,-25],zoom:3,attributionControl:{compact:true}});
      map.current=instance;
      instance.addControl(new lib.NavigationControl({showCompass:false}),"top-right");
      let fitted=false;
      instance.on("style.load",() => {
        if (cancelled) return;
        instance.addSource("jobs",{type:"geojson",data:featureData(latest.current.pins),cluster:true,clusterRadius:45,clusterProperties:{jobs:["+",["get","count"]]}});
        instance.addLayer({id:"job-clusters",type:"circle",source:"jobs",filter:["has","point_count"],paint:{"circle-color":"#377fa7","circle-radius":23,"circle-stroke-width":3,"circle-stroke-color":"#ffffff"}});
        instance.addLayer({id:"job-cluster-count",type:"symbol",source:"jobs",filter:["has","point_count"],layout:{"text-field":["to-string",["get","jobs"]],"text-size":13},paint:{"text-color":"#ffffff"}});
        instance.addLayer({id:"job-points",type:"circle",source:"jobs",filter:["!",["has","point_count"]],paint:{"circle-color":"#377fa7","circle-radius":17,"circle-stroke-width":3,"circle-stroke-color":"#ffffff"}});
        instance.addLayer({id:"job-point-count",type:"symbol",source:"jobs",filter:["!",["has","point_count"]],layout:{"text-field":["to-string",["get","count"]],"text-size":12},paint:{"text-color":"#ffffff"}});
        if (!fitted && latest.current.pins.length) { fitPins(instance,latest.current.pins); fitted=true; }
        setReady(true);
      });
      instance.on("click","job-clusters",async event => {
        if (latest.current.picking) return;
        const feature=event.features?.[0];
        if (!feature || feature.geometry.type!=="Point") return;
        try {
          const zoom=await (instance.getSource("jobs") as GeoJSONSource).getClusterExpansionZoom(Number(feature.properties.cluster_id));
          if (!cancelled) instance.easeTo({center:feature.geometry.coordinates as [number,number],zoom,duration:window.matchMedia("(prefers-reduced-motion: reduce)").matches?0:350});
        } catch { /* The style may have changed while a cluster was opening. */ }
      });
      instance.on("click","job-points",event => {
        if (!latest.current.picking) latest.current.onSelect?.(String(event.features?.[0]?.properties.id ?? ""));
      });
      instance.on("click",event => { if (latest.current.picking) { const point=event.lngLat.wrap(); latest.current.onPick?.(point.lat,point.lng); } });
      instance.on("error",()=> {if(!cancelled && !instance.isStyleLoaded()) setError("The map is unavailable right now. Your locations and jobs are still listed alongside it.");});
      instance.on("idle",()=> {if(!cancelled && instance.isStyleLoaded()) setError("");});
      instance.on("mouseenter","job-points",()=> {instance.getCanvas().style.cursor="pointer";});
      instance.on("mouseleave","job-points",()=> {instance.getCanvas().style.cursor=latest.current.picking?"crosshair":"";});
      resize=new ResizeObserver(()=>instance.resize());
      resize.observe(container.current);
    }).catch(()=> { if (!cancelled) setError("The map couldn’t load on this device. You can still browse the locations below."); });
    return () => {cancelled=true;resize?.disconnect();map.current?.remove();map.current=null;};
  },[]);
  useEffect(()=> {
    const instance=map.current;
    if (ready && instance?.getSource("jobs")) (instance.getSource("jobs") as GeoJSONSource).setData(featureData(props.pins));
  },[props.pins,ready]);
  useEffect(()=> { if (ready) map.current?.setStyle(styleUrl(props.dark)); },[props.dark]); // eslint-disable-line react-hooks/exhaustive-deps -- only a theme change replaces the style
  useEffect(()=> { if (ready && map.current) fitPins(map.current,props.pins); },[props.fitVersion,ready]); // eslint-disable-line react-hooks/exhaustive-deps -- refreshing records must not reset a user's map position
  useEffect(()=> {
    const pin=props.pins.find(pin=>pin.id===props.selectedId);
    if (ready && pin && map.current) map.current.easeTo({center:[pin.longitude,pin.latitude],zoom:pin.approximate?10:14,duration:window.matchMedia("(prefers-reduced-motion: reduce)").matches?0:350});
  },[props.selectedId,ready]); // eslint-disable-line react-hooks/exhaustive-deps -- don't fly the camera on unrelated record refreshes
  useEffect(()=> { if (map.current) map.current.getCanvas().style.cursor=props.picking?"crosshair":""; },[props.picking,ready]);
  return <div className="job-map-canvas-wrap"><div ref={container} className="job-map-canvas" role="region" aria-label={props.picking?"Choose a location by clicking the map":"Job locations map"} />{error ? <p className="job-map-fallback" role="status">{error}</p> : null}</div>;
}
