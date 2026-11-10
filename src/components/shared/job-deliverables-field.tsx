"use client";

import { useState } from "react";
import { ListChecks, Plus, Trash2 } from "lucide-react";
import { getJobDeliverables, getJobDeliverableRows, type JobDeliverable, type JobLinkedTask } from "@/lib/job-deliverable-model";
import { formatDate } from "@/lib/format";

export function JobDeliverablesField({ initialItems, legacyItems, linkedTasks }: { initialItems?: JobDeliverable[]; legacyItems?: string[]; linkedTasks?: JobLinkedTask[] }) {
  const [items, setItems] = useState(() => getJobDeliverables({ deliverables: initialItems, key_deliverables: legacyItems }));
  const linked = getJobDeliverableRows({ deliverables: items, linked_tasks: linkedTasks }).filter(item => item.task_id && item.id.startsWith("task:"));
  function update(id: string, patch: Partial<JobDeliverable>) {
    setItems((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  }
  return <fieldset className="job-deliverables-field form-span">
    <legend><ListChecks size={15} /> Key deliverables</legend>
    <p>Name each output and optionally give it a deadline.</p>
    <input type="hidden" name="deliverables" value={JSON.stringify(items.map((item) => ({ ...item, name: item.name.trim() })))} />
    {items.length ? <div className="job-deliverable-rows">{items.map((item, index) => <div className="job-deliverable-row" key={item.id}>
      <span className="job-deliverable-number" aria-hidden="true">{index + 1}</span>
      <label><span>Name</span><input value={item.name} onChange={(event) => update(item.id, { name: event.target.value })} required maxLength={300} placeholder="e.g. Product launch reel" aria-label={`Deliverable ${index + 1} name`} /></label>
      <label><span>Date <small>Optional</small></span><div className="optional-deliverable-date"><input type="date" data-empty={!item.date} value={item.date ?? ""} onChange={(event) => update(item.id, { date: event.target.value || null })} aria-label={`Deliverable ${index + 1} date`} />{!item.date ? <span aria-hidden="true">No date set</span> : null}</div></label>
      <button type="button" className="job-deliverable-remove" onClick={() => setItems((current) => current.filter((entry) => entry.id !== item.id))} aria-label={`Remove deliverable ${index + 1}`}><Trash2 size={16} /></button>
    </div>)}</div> : !linked.length ? <div className="job-deliverable-empty">No deliverables yet. Add the outputs you’re planning to create.</div> : null}
    {linked.length ? <section aria-label="Linked tasks and assets"><h4>Already linked to this job</h4><p>These outputs are existing tasks. Their progress is shown here; saving this brief won’t create extra copies.</p><ul className="job-deliverables-list">{linked.map(item => <li key={item.id}><strong>{item.name}</strong>{item.date ? <time dateTime={item.date}>Due {formatDate(item.date)}</time> : null}{item.status_label ? <span> · {item.status_label}</span> : null}</li>)}</ul></section> : null}
    <button type="button" className="job-deliverable-add" disabled={items.length >= 30} onClick={() => setItems((current) => [...current, { id: crypto.randomUUID(), name: "", date: null }])}><Plus size={15} /> Add deliverable</button>
  </fieldset>;
}
