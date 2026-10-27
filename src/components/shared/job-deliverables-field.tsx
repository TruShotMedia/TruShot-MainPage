"use client";

import { useState } from "react";
import { ListChecks, Plus, Trash2 } from "lucide-react";
import { getJobDeliverables, type JobDeliverable } from "@/lib/job-deliverable-model";

export function JobDeliverablesField({ initialItems, legacyItems }: { initialItems?: JobDeliverable[]; legacyItems?: string[] }) {
  const [items, setItems] = useState(() => getJobDeliverables({ deliverables: initialItems, key_deliverables: legacyItems }));
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
    </div>)}</div> : <div className="job-deliverable-empty">No deliverables yet. Add the outputs you’re planning to create.</div>}
    <button type="button" className="job-deliverable-add" disabled={items.length >= 30} onClick={() => setItems((current) => [...current, { id: crypto.randomUUID(), name: "", date: null }])}><Plus size={15} /> Add deliverable</button>
  </fieldset>;
}
