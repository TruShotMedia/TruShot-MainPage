"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ListPlus, LoaderCircle } from "lucide-react";
import { createDeliverableTasks, updateTabletJob } from "@/app/admin/actions";

export function CreateDeliverableTasksButton({ jobId, onCreated, requireSaved = false }: { jobId: string; onCreated?: () => void; requireSaved?: boolean }) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();
  return <div className="job-deliverables-generate">
    <button type="button" disabled={pending} onClick={async (event) => {
      const form = event.currentTarget.closest("form");
      if (requireSaved && (!form || !form.reportValidity())) return;
      setPending(true); setMessage("");
      try {
        if (requireSaved && form) await updateTabletJob(new FormData(form));
        const result = await createDeliverableTasks(jobId);
        setMessage(`${result.createdCount} ${result.createdCount === 1 ? "task created" : "tasks created"}${result.existingCount ? ` · ${result.existingCount} already linked` : ""}.`);
        onCreated?.();
        router.refresh();
      } catch (error) { setMessage(error instanceof Error ? error.message : "Tasks could not be created."); }
      finally { setPending(false); }
    }}>{pending ? <LoaderCircle className="spin" size={15} /> : <ListPlus size={15} />} {pending ? "Creating tasks…" : requireSaved ? "Save & create tasks from deliverables" : "Create tasks from deliverables"}</button>
    <small>{requireSaved ? "Saves this job first, then creates linked tasks. " : "Each saved deliverable becomes a linked task. "}Existing tasks are never duplicated.</small>
    {message ? <p role="status">{message}</p> : null}
  </div>;
}
