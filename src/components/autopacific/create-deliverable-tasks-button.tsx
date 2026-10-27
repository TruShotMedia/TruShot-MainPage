"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ListPlus, LoaderCircle } from "lucide-react";
import { createDeliverableTasks, updateTabletJob } from "@/app/admin/actions";
import { useJobSupportingData } from "@/components/autopacific/job-supporting-data";
import type { JobDeliverable } from "@/lib/job-deliverable-model";

export function CreateDeliverableTasksButton({ jobId, deliverables, onCreated, requireSaved = false }: { jobId: string; deliverables?: JobDeliverable[]; onCreated?: () => void; requireSaved?: boolean }) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();
  const wrapper=useRef<HTMLDivElement>(null);
  const [draft,setDraft]=useState(deliverables);
  const support=useJobSupportingData(jobId);
  const linked=new Set(support.data?.linkedTasks.map(task=>task.source_deliverable_id)??[]);
  const remaining=draft?.filter(item=>!linked.has(item.id)).length;
  useEffect(()=>{if(!requireSaved)return;const form=wrapper.current?.closest("form");if(!form)return;const sync=()=>queueMicrotask(()=>{try{const value=new FormData(form).get("deliverables");if(typeof value==="string")setDraft(JSON.parse(value));}catch{/* The server validates the saved brief. */}});for(const type of ["input","change","click"])form.addEventListener(type,sync);return()=>{for(const type of ["input","change","click"])form.removeEventListener(type,sync);};},[requireSaved]);
  const allLinked=Boolean(draft?.length&&remaining===0&&support.data);
  return <div className="job-deliverables-generate" ref={wrapper}>
    {allLinked ? <p className="deliverables-linked" role="status">{draft!.length} deliverables · tasks linked</p> : <button type="button" disabled={pending||Boolean(draft&&(!draft.length||support.loading||support.error))} onClick={async (event) => {
      const form = event.currentTarget.closest("form");
      if (requireSaved && (!form || !form.reportValidity())) return;
      setPending(true); setMessage("");
      try {
        if (requireSaved && form) await updateTabletJob(new FormData(form));
        const result = await createDeliverableTasks(jobId);
        setMessage(`${result.createdCount} ${result.createdCount === 1 ? "task created" : "tasks created"}${result.existingCount ? ` · ${result.existingCount} already linked` : ""}.`);
        onCreated?.();
        await support.reload();
        router.refresh();
      } catch (error) { setMessage(error instanceof Error ? error.message : "Tasks could not be created."); }
      finally { setPending(false); }
    }}>{pending ? <LoaderCircle className="spin" size={15} /> : <ListPlus size={15} />} {pending ? "Creating tasks…" : requireSaved ? `Save & create ${remaining??""} tasks from deliverables` : `Create ${remaining??""} tasks from deliverables`}</button>}
    <small>{allLinked?`${support.data?.linkedTasks.filter(task=>task.completed_at).length??0} completed. New deliverables will appear here when added.`:"A deliverable date takes priority, otherwise the job deadline is used. No job deadline means no task deadline. Existing tasks are never duplicated."}</small>
    {support.error&&draft?<p role="alert">{support.error}<button type="button" onClick={()=>void support.reload()}>Retry linked tasks</button></p>:null}
    {message ? <p role="status">{message}</p> : null}
  </div>;
}
