"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { ArrowDown, ArrowUp, CalendarDays, Check, ChevronDown, FolderKanban, ListPlus, LoaderCircle, Plus, Search, Trash2, X } from "lucide-react";
import { WorkspaceDialog } from "@/components/shared/workspace-dialog";
import { loadProductionCampaigns, saveProductionCampaign, archiveProductionCampaign } from "@/app/autopacific/campaign-actions";
import { createDeliverableTasks } from "@/app/admin/actions";
import { campaignProgress, campaignWeekRange, changeCampaignStart, newCampaignId, newCampaignJob, newCampaignWeek, shiftCampaignWeek, type CampaignPlan, type CampaignPlanJob } from "@/lib/production-campaigns";
import { formatDate, todayDateInput } from "@/lib/format";
import type { JobStatus } from "@/lib/types";
import "./campaign-workspace.css";

function LinkedTasks({ job, disabled, onCreated, onBusy }: { job: CampaignPlanJob; disabled: boolean; onCreated: () => Promise<void>; onBusy: (pending: boolean) => void }) {
  const [pending, setPending] = useState(false), [error, setError] = useState("");
  const linked = new Set(job.tasks.map(task => task.source_deliverable_id));
  const remaining = job.deliverables.filter(item => !linked.has(item.id)).length;
  if (!job.deliverables.length) return null;
  const deliverableIds = new Set(job.deliverables.map(item => item.id));
  if (!remaining) return <p className="campaign-linked"><Check size={14} /> All {job.deliverables.length} deliverables have linked tasks · {job.tasks.filter(task => task.source_deliverable_id && deliverableIds.has(task.source_deliverable_id) && task.completed_at).length} complete</p>;
  return <div className="campaign-task-action"><button type="button" disabled={disabled || pending || !job.updated_at} onClick={async () => {
    setPending(true); onBusy(true); setError("");
    try { await createDeliverableTasks(job.id); await onCreated(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Tasks could not be created."); }
    finally { setPending(false); onBusy(false); }
  }}>{pending ? <LoaderCircle size={14} className="spin" /> : <ListPlus size={14} />} Create {remaining} linked {remaining === 1 ? "task" : "tasks"}</button>
    <small>{disabled || !job.updated_at ? "Save the campaign first to use the latest deliverables." : "Deliverable date → job deadline → no deadline. Existing tasks are not duplicated."}</small>
    {error ? <p role="alert">{error}</p> : null}
  </div>;
}

export function CampaignPlanner({ initial, statuses, editable, marketing, busy, error, onClose, onSave, onArchive, onReload }: {
  initial: CampaignPlan; statuses: JobStatus[]; editable: boolean; marketing: boolean; busy: boolean; error: string;
  onClose: () => void; onSave: (plan: CampaignPlan) => void; onArchive: () => void; onReload: () => Promise<void>;
}) {
  const [plan, setPlan] = useState(initial);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [taskBusy, setTaskBusy] = useState(false);
  const locked = busy || taskBusy;
  const dirty = JSON.stringify(plan) !== JSON.stringify(initial);
  const progress = campaignProgress(plan, statuses);
  const planningId = statuses.find(status => status.key === "planning")?.id ?? statuses[0]?.id ?? "";
  const byStatus = new Map(statuses.map(status => [status.id, status]));
  function close() {
    if (dirty && !window.confirm("Discard your unsaved campaign changes?")) return;
    onClose();
  }
  function updateJob(weekId: string, jobId: string, update: Partial<CampaignPlanJob>) {
    setPlan(current => ({ ...current, weeks: current.weeks.map(week => week.id === weekId ? { ...week, jobs: week.jobs.map(job => job.id === jobId ? { ...job, ...update } : job) } : week) }));
  }
  function removeWeek(index: number) {
    const week = plan.weeks[index];
    if (week.jobs.some(job => job.updated_at) && !window.confirm("Remove this week from the campaign? Its saved jobs and tasks will stay in the workspace as standalone work. Later planned weeks move forward by seven days.")) return;
    setPlan(current => ({ ...current, weeks: current.weeks.filter((_, i) => i !== index).map((week, i) => i >= index ? shiftCampaignWeek(week, -7, statuses) : week) }));
  }
  function reorderWeek(index: number, direction: number) {
    const next = index + direction;
    setPlan(current => {
      const weeks = [...current.weeks];
      weeks[index] = shiftCampaignWeek(current.weeks[next], -direction * 7, statuses);
      weeks[next] = shiftCampaignWeek(current.weeks[index], direction * 7, statuses);
      return { ...current, weeks };
    });
  }
  return <WorkspaceDialog className="campaign-planner-dialog" titleId="campaign-planner-title" onClose={close} busy={locked}
    header={<><div><span>Campaign / weekly content plan</span><h2 id="campaign-planner-title">{initial.updated_at ? initial.title : "Build your next campaign"}</h2></div><button type="button" aria-label="Close campaign" disabled={locked} onClick={close}><X size={19} /></button></>}
    onSubmit={editable ? event => { event.preventDefault(); if (!locked) onSave(plan); } : undefined}
    footer={<><span className="campaign-footer-note">{error ? <span role="alert">{error}</span> : editable ? dirty ? "Unsaved changes" : "All changes saved" : "Enable the pencil to edit this plan."}</span>
      {editable && initial.updated_at ? <button type="button" className="campaign-archive" disabled={locked} onClick={() => setConfirmRemove(true)}>Archive</button> : null}
      <button type="button" disabled={locked} onClick={close}>{editable ? "Cancel" : "Close"}</button>
      {editable ? <button type="submit" className="admin-primary-button is-primary" disabled={locked}>{busy ? <LoaderCircle size={15} className="spin" /> : <Check size={15} />} {busy ? "Saving…" : "Save campaign"}</button> : null}</>}
  >
    <fieldset className="campaign-planner-layout" disabled={locked}>
      <aside className="campaign-plan-summary">
        <div className="campaign-auto-status"><span style={{ background: progress.status?.color }} /><strong>{progress.status?.label ?? "Planning"}</strong><small>Automatic status</small></div>
        <label>Campaign title{editable ? <input required minLength={2} maxLength={180} value={plan.title} onChange={event => setPlan({ ...plan, title: event.target.value })} placeholder="R.A.T. Run content campaign" /> : <strong>{plan.title}</strong>}</label>
        <label>First week starts{editable ? <input type="date" required value={plan.start_date} onChange={event => { if (event.target.value) setPlan(changeCampaignStart(plan, event.target.value, statuses)); }} /> : <strong>{formatDate(plan.start_date)}</strong>}</label>
        <small className="campaign-help">Seven-day weeks follow this date. Planning/Scheduled dates shift with weeks; work already underway keeps its dates.</small>
        <details className="campaign-context"><summary>Objective & planning notes <ChevronDown size={14} /></summary><div>
          <label>Campaign objective{editable ? <textarea rows={4} maxLength={3000} value={plan.objective ?? ""} onChange={event => setPlan({ ...plan, objective: event.target.value })} placeholder="What should this series achieve?" /> : <p>{plan.objective || "No objective added."}</p>}</label>
          <label>Planning notes{editable ? <textarea rows={4} maxLength={8000} value={plan.notes ?? ""} onChange={event => setPlan({ ...plan, notes: event.target.value })} placeholder="Audience, publishing approach, dependencies…" /> : <p>{plan.notes || "No planning notes."}</p>}</label>
        </div></details>
        <div className="campaign-summary-numbers"><span><strong>{plan.weeks.length}</strong> weeks</span><span><strong>{progress.jobs}</strong> jobs</span><span><strong>{progress.deliverables}</strong> deliverables</span></div>
        <p className="campaign-help">Status follows the least-advanced active job. Reopening work or adding a planning job can move it back.</p>
        <nav aria-label="Campaign weeks">{plan.weeks.map((week, index) => <a key={week.id} href={`#campaign-week-${week.id}`}>Week {index + 1}<small>{week.title || `${week.jobs.length} jobs`}</small></a>)}</nav>
      </aside>
      <div className="campaign-weeks">
        {plan.weeks.map((week, index) => {
          const range = campaignWeekRange(plan.start_date, index);
          return <section className="campaign-week" id={`campaign-week-${week.id}`} key={week.id}>
            <header><span className="campaign-week-number">{String(index + 1).padStart(2, "0")}</span><div><h3>Week {index + 1}</h3><p><CalendarDays size={13} /> {formatDate(range.start)} — {formatDate(range.end)}</p></div>
              {editable ? <div className="campaign-week-controls"><button type="button" aria-label={`Move week ${index + 1} earlier`} disabled={index === 0 || busy} onClick={() => reorderWeek(index, -1)}><ArrowUp size={14} /></button><button type="button" aria-label={`Move week ${index + 1} later`} disabled={index === plan.weeks.length - 1 || busy} onClick={() => reorderWeek(index, 1)}><ArrowDown size={14} /></button><button type="button" aria-label={`Remove week ${index + 1}`} disabled={plan.weeks.length === 1 || busy} onClick={() => removeWeek(index)}><Trash2 size={14} /></button></div> : null}
            </header>
            {editable ? <label className="campaign-week-focus">Week focus<input value={week.title} maxLength={180} placeholder="Teaser, episode release, supporting content…" onChange={event => setPlan({ ...plan, weeks: plan.weeks.map(item => item.id === week.id ? { ...item, title: event.target.value } : item) })} /></label> : week.title ? <p>{week.title}</p> : null}
            {week.jobs.map((job, jobIndex) => {
              const stage = byStatus.get(job.status_id);
              const historical = stage?.key === "delayed";
              const canEdit = editable && !historical;
              return <article className={`campaign-plan-job ${historical ? "is-history" : ""}`} key={job.id}>
                <header><span>Job {jobIndex + 1}</span>{historical ? <small>Delayed original · retained for history</small> : null}{canEdit ? <button type="button" aria-label={`Remove ${job.title || "job"} from week ${index + 1}`} disabled={week.jobs.length <= 1 || busy} onClick={() => {
                  if (job.updated_at && !window.confirm("Remove this job from the campaign? The job and its tasks will stay in the workspace.")) return;
                  setPlan({ ...plan, weeks: plan.weeks.map(item => item.id === week.id ? { ...item, jobs: item.jobs.filter(item => item.id !== job.id) } : item) });
                }}><X size={15} /></button> : null}</header>
                <div className="campaign-job-fields">
                  <label className="campaign-field-wide">Job / content brief{canEdit ? <input required minLength={2} maxLength={220} value={job.title} onChange={event => updateJob(week.id, job.id, { title: event.target.value })} placeholder="Episode 1 — Hit the dirt" /> : <strong>{job.title}</strong>}</label>
                  <label>Status{canEdit ? <select value={job.status_id} onChange={event => updateJob(week.id, job.id, { status_id: event.target.value })}>{statuses.filter(item => item.key !== "delayed").map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select> : <strong>{stage?.label}</strong>}</label>
                  <label>Shoot date{canEdit ? <div className="optional-deliverable-date"><input type="date" data-empty={!job.shoot_date} value={job.shoot_date ?? ""} onChange={event => updateJob(week.id, job.id, { shoot_date: event.target.value || null })} />{!job.shoot_date ? <span aria-hidden="true">Not scheduled</span> : null}</div> : <strong>{formatDate(job.shoot_date)}</strong>}</label>
                  <label>Job deadline{canEdit ? <div className="optional-deliverable-date"><input type="date" data-empty={!job.due_date} min={job.shoot_date ?? undefined} value={job.due_date ?? ""} onChange={event => updateJob(week.id, job.id, { due_date: event.target.value || null })} />{!job.due_date ? <span aria-hidden="true">No deadline</span> : null}</div> : <strong>{formatDate(job.due_date)}</strong>}</label>
                </div>
                <details className="campaign-job-context"><summary>Brief & location <ChevronDown size={14} /></summary><div className="campaign-job-fields"><label className="campaign-field-wide">Brief{canEdit ? <textarea rows={3} maxLength={2000} value={job.description ?? ""} onChange={event => updateJob(week.id, job.id, { description: event.target.value })} /> : <p>{job.description || "No brief added."}</p>}</label><label className="campaign-field-wide">Location{canEdit ? <input maxLength={300} value={job.location ?? ""} onChange={event => updateJob(week.id, job.id, { location: event.target.value })} /> : <p>{job.location || "Not set"}</p>}</label></div></details>
                <div className="campaign-deliverables"><header><h4>Deliverables</h4><small>{job.deliverables.length} planned</small></header>
                  {job.deliverables.map((item, itemIndex) => <div className="campaign-deliverable" key={item.id}><span>{String(itemIndex + 1).padStart(2, "0")}</span>
                    <label><span className="sr-only">Deliverable {itemIndex + 1} name for {job.title || "new job"}</span>{canEdit ? <input required maxLength={300} value={item.name} placeholder="Episode preview reel" onChange={event => updateJob(week.id, job.id, { deliverables: job.deliverables.map(deliverable => deliverable.id === item.id ? { ...deliverable, name: event.target.value } : deliverable) })} /> : <strong>{item.name}</strong>}</label>
                    <label><span className="sr-only">Deliverable {itemIndex + 1} due date for {job.title || "new job"}</span>{canEdit ? <div className="optional-deliverable-date"><input type="date" data-empty={!item.date} value={item.date ?? ""} title="Optional · otherwise uses job deadline" onChange={event => updateJob(week.id, job.id, { deliverables: job.deliverables.map(deliverable => deliverable.id === item.id ? { ...deliverable, date: event.target.value || null } : deliverable) })} />{!item.date ? <span aria-hidden="true">{job.due_date ? "Job deadline" : "No deadline"}</span> : null}</div> : <small>{formatDate(item.date ?? job.due_date)}</small>}</label>
                    {canEdit ? <button type="button" aria-label={`Remove deliverable ${itemIndex + 1} from ${job.title || "new job"}`} onClick={() => updateJob(week.id, job.id, { deliverables: job.deliverables.filter(deliverable => deliverable.id !== item.id) })}><X size={14} /></button> : null}
                  </div>)}
                  {canEdit ? <button type="button" className="campaign-add-quiet" disabled={job.deliverables.length >= 30} onClick={() => updateJob(week.id, job.id, { deliverables: [...job.deliverables, { id: newCampaignId(), name: "", date: null }] })}><Plus size={14} /> Add deliverable</button> : null}
                  {!job.deliverables.length && !canEdit ? <p>No deliverables planned yet.</p> : null}
                  {!marketing && canEdit && !stage?.is_closed ? <LinkedTasks job={job} disabled={dirty || busy} onCreated={onReload} onBusy={setTaskBusy} /> : null}
                </div>
              </article>;
            })}
            {editable ? <button type="button" className="campaign-add-job" disabled={busy || week.jobs.length >= 20} onClick={() => setPlan({ ...plan, weeks: plan.weeks.map(item => item.id === week.id ? { ...item, jobs: [...item.jobs, newCampaignJob(planningId)] } : item) })}><Plus size={15} /> Add job to week {index + 1}</button> : null}
          </section>;
        })}
        {editable ? <button type="button" className="campaign-add-week" disabled={busy || plan.weeks.length >= 52} onClick={() => setPlan({ ...plan, weeks: [...plan.weeks, newCampaignWeek(planningId)] })}><Plus size={18} /><span>Add week<small>Another seven days, with a job ready to plan.</small></span></button> : null}
      </div>
    </fieldset>
    {confirmRemove ? <div className="campaign-archive-confirm" role="alert"><strong>Archive this campaign?</strong><p>Its jobs, tasks and calendar entries stay in your workspace. This campaign will leave the Campaigns tab.</p><button type="button" disabled={busy} onClick={() => setConfirmRemove(false)}>Keep campaign</button><button type="button" disabled={busy} onClick={onArchive}>Archive campaign</button></div> : null}
  </WorkspaceDialog>;
}

export function CampaignWorkspace({ statuses, marketing = false, editable = true, refreshKey = 0, onChanged }: { statuses: JobStatus[]; marketing?: boolean; editable?: boolean; refreshKey?: number; onChanged?: () => void }) {
  const [plans, setPlans] = useState<CampaignPlan[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [view, setView] = useState("pipeline"), [search, setSearch] = useState("");
  const [editing, setEditing] = useState<CampaignPlan | null>(null), [busy, setBusy] = useState(false), [editorError, setEditorError] = useState("");
  const [editorEpoch, setEditorEpoch] = useState(0);
  const workspaceRef = useRef<HTMLElement>(null);
  const [dialogHost, setDialogHost] = useState<Element | null>(null);
  const generation = useRef(0);
  const reload = useCallback(async () => {
    const request = ++generation.current;
    setLoading(true); setError("");
    try { const data = await loadProductionCampaigns(); if (generation.current === request) setPlans(data); return data; }
    catch (reason) { if (generation.current === request) setError(reason instanceof Error ? reason.message : "Campaigns could not be loaded."); return null; }
    finally { if (generation.current === request) setLoading(false); }
  }, []);
  const open = Boolean(editing);
  const invalidatePendingRequest = useCallback(() => { generation.current++; }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => { if (!open) void reload(); }, 0);
    return () => { window.clearTimeout(timer); invalidatePendingRequest(); };
  }, [reload, refreshKey, open, invalidatePendingRequest]);
  const stages = statuses.filter(status => status.key !== "delayed").sort((a, b) => a.position - b.position);
  const visible = plans.filter(plan => plan.title.toLowerCase().includes(search.toLowerCase()));
  const columns = view === "planning" ? stages.filter(status => status.key === "planning") : stages.filter(status => status.key !== "planning");
  function openPlanner(plan: CampaignPlan) {
    setDialogHost(workspaceRef.current?.closest(".tablet-kiosk,.apg-desktop") ?? document.body);
    setEditorError(""); setEditing(plan);
  }
  function create() { openPlanner({ id: newCampaignId(), title: "", objective: null, notes: null, updated_at: null, start_date: todayDateInput(), weeks: [newCampaignWeek(stages[0]?.id ?? "")] }); }
  async function refreshEditor() {
    const data = await reload();
    if (data) { setEditing(current => data.find(plan => plan.id === current?.id) ?? current); setEditorEpoch(value => value + 1); }
  }
  return <section ref={workspaceRef} className="production-campaign-workspace" aria-label="Campaign workspace">
    <header className="campaign-workspace-toolbar"><div role="group" aria-label="Campaign views"><button type="button" aria-pressed={view === "pipeline"} onClick={() => setView("pipeline")}>Pipeline</button><button type="button" aria-pressed={view === "planning"} onClick={() => setView("planning")}>Planning <small>{plans.filter(plan => campaignProgress(plan, statuses).status?.key === "planning").length}</small></button></div>
      <label className="production-campaign-search"><Search size={15} /><input aria-label="Search campaigns" placeholder="Search campaigns…" value={search} onChange={event => setSearch(event.target.value)} /></label>
      {editable ? <button type="button" className="campaign-create" onClick={create}><Plus size={15} /> New campaign</button> : null}
    </header>
    <p className="campaign-workspace-caption"><FolderKanban size={14} /> Campaign → weeks → jobs → deliverables. Status follows the jobs automatically.</p>
    {error ? <p role="alert" className="campaign-load-error">{error} <button type="button" onClick={() => void reload()}>Retry</button></p> : null}
    {loading ? <p role="status" className="campaign-loading"><LoaderCircle size={17} className="spin" /> Updating campaigns…</p> : null}
    {!plans.length && !loading && !error ? <div className="production-campaign-empty"><FolderKanban size={32} /><h2>One campaign. Every week connected.</h2><p>Plan the series, brief each job and turn its deliverables into linked tasks.</p>{editable ? <button type="button" onClick={create}><Plus size={16} /> Create your first campaign</button> : <p>Campaign plans will appear here when created.</p>}</div> : <div className={`campaign-board ${view === "planning" ? "is-planning" : ""}`}>
      {columns.map(status => {
        const items = visible.filter(plan => campaignProgress(plan, statuses).status?.id === status.id);
        return <section className="campaign-column" key={status.id}><header><i style={{ background: status.color }} /><h2>{status.label}</h2><small>{items.length}</small></header><div>{items.map(plan => {
          const progress = campaignProgress(plan, statuses), end = campaignWeekRange(plan.start_date, Math.max(0, plan.weeks.length - 1)).end;
          return <button type="button" className="campaign-card" style={{ "--campaign-status-color": status.color } as CSSProperties} key={plan.id} onClick={() => openPlanner(plan)}><small>{plan.weeks.length} WEEK CAMPAIGN</small><h3>{plan.title}</h3>{plan.objective ? <p>{plan.objective}</p> : null}<span><CalendarDays size={13} /> {formatDate(plan.start_date)} — {formatDate(end)}</span><div className="campaign-card-progress"><span style={{ width: `${progress.jobs ? progress.completed / progress.jobs * 100 : 0}%` }} /></div><footer><span>{progress.completed}/{progress.jobs} jobs complete</span><span>{progress.deliverables} deliverables</span></footer></button>;
        })}{!items.length ? <p className="campaign-column-empty">{view === "planning" ? "No planning campaigns" : "No campaigns at this stage"}</p> : null}</div></section>;
      })}
    </div>}
    {editing && dialogHost ? createPortal(<CampaignPlanner key={`${editing.id}:${editing.updated_at}:${editorEpoch}`} initial={editing} statuses={statuses} editable={editable} marketing={marketing} busy={busy} error={editorError} onClose={() => setEditing(null)} onReload={refreshEditor}
      onSave={async plan => {
        if (new TextEncoder().encode(JSON.stringify(plan)).length > 750_000) { setEditorError("This campaign is too large to save safely. Split it into smaller campaigns or shorten the briefs."); return; }
        setBusy(true); setEditorError("");
        try {
          const result = await saveProductionCampaign(plan);
          if (!result.ok) { setEditorError(result.error); return; }
          const latest = await reload();
          if (latest) setEditing(latest.find(item => item.id === plan.id) ?? null);
          else { setEditing(null); setError("Campaign saved. Refresh to load its latest details."); }
          onChanged?.();
        } catch (reason) { setEditorError(reason instanceof Error ? reason.message : "The campaign could not be saved."); }
        finally { setBusy(false); }
      }}
      onArchive={async () => {
        if (!editing.updated_at) return;
        setBusy(true); setEditorError("");
        try { const result = await archiveProductionCampaign(editing.id, editing.updated_at); if (!result.ok) { setEditorError(result.error); return; } setEditing(null); onChanged?.(); }
        catch (reason) { setEditorError(reason instanceof Error ? reason.message : "The campaign could not be archived."); }
        finally { setBusy(false); }
      }} />, dialogHost) : null}
  </section>;
}
