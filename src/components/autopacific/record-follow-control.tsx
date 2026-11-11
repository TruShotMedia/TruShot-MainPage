"use client";
import {useEffect,useState,useTransition} from "react";
import {BellPlus,BellRing,LoaderCircle} from "lucide-react";
import {loadWorkRecordFollowing,setWorkRecordFollowing} from "@/app/autopacific/follow-actions";
import "./record-follow-control.css";

export function RecordFollowControl({recordId,recordKind}:{recordId:string;recordKind:"job"|"task"}) {
  const [state,setState]=useState<{id:string;following:boolean}|null>(null);
  const [error,setError]=useState("");
  const [pending,startTransition]=useTransition();
  const key=`${recordKind}:${recordId}`;
  const loaded=state?.id===key;
  const following=loaded&&state.following;
  useEffect(()=>{
    let active=true;
    loadWorkRecordFollowing({recordId,recordKind}).then(result=>{if(active)setState({id:key,...result});})
      .catch(()=>{if(active)setError("Update preference unavailable. Reopen this item to retry.");});
    return()=>{active=false;};
  },[recordId,recordKind,key]);
  function toggle() {
    setError("");
    startTransition(async()=>{
      try {
        const result=await setWorkRecordFollowing({recordId,recordKind,following:!following});
        setState({id:key,...result});
        window.dispatchEvent(new Event("production-comments-changed"));
      }catch{setError("Couldn’t save. Please try again.");}
    });
  }
  return <div className="record-follow-control">
    <button type="button" disabled={!loaded||pending} aria-pressed={Boolean(following)} onClick={toggle}
      title="Follow this item’s updates without being assigned. Assignment and direct @mentions still notify you." aria-label={following?"Stop following this item":"Follow this item’s updates"}>
      {pending||(!loaded&&!error)?<LoaderCircle size={14} className="spin"/>:following?<BellRing size={14}/>:<BellPlus size={14}/>}
      {following?"Following":"Follow"}
    </button>
    {error?<small role="alert">{error}</small>:null}
  </div>;
}
