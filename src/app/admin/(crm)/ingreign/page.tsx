import Image from "next/image";
import { BellRing, CalendarPlus, HeartHandshake, Save, Trash2 } from "lucide-react";
import { deleteIngreignManualEvent, saveIngreignManualEvent, updateIngreignCaption } from "@/app/admin/ingreign-actions";
import { PageHeader } from "@/components/admin/page-header";
import { getIngreignAdminData } from "@/lib/data/ingreign";

const generatorModes = [
  ["date_only", "Date only"],
  ["countdown_3", "03 days"],
  ["countdown_2", "02 days"],
  ["countdown_1", "01 day"],
] as const;

export default async function IngreignAdminPage() {
  const data = await getIngreignAdminData();
  if (!data) return null;
  return (
    <>
      <PageHeader eyebrow="Client portal" title="INGREIGN" description="Control the approved caption library and add one-off posting markers to the private INGREIGN calendar." />
      <section className="admin-card ingreign-admin-summary">
        <div className="ingreign-admin-logo"><Image src="/ingreign/ingreign-logo-white.png" alt="INGREIGN" width={900} height={780} /></div>
        <div><p className="card-label">Dedicated workspace</p><h2>Content rhythm, without the admin clutter.</h2><p>The client account can reach only <strong>/ingreign</strong>. It has no CRM membership and its reminders are isolated from TruShot admin alerts.</p></div>
        <div className="ingreign-admin-stats"><span><strong>{data.presets.length}</strong> caption actions</span><span><strong>{data.manualEvents.length}</strong> manual dates</span><span><strong>{data.subscriptionCount}</strong> reminder devices</span></div>
      </section>

      <section className="ingreign-admin-section">
        <div className="ingreign-admin-section-heading"><div><HeartHandshake size={18} /><span><strong>Quick captions</strong><small>Use tokens like {"{{MONTH}}"}, {"{{DAY}}"}, {"{{EVENT_MONTH}}"} and {"{{EVENT_DAY}}"}.</small></span></div></div>
        <div className="ingreign-admin-captions">
          {data.presets.map((preset) => (
            <form action={updateIngreignCaption} className="admin-card ingreign-admin-caption" key={preset.id}>
              <input type="hidden" name="id" value={preset.id} />
              <div className="ingreign-admin-caption-title"><span>{String(preset.position / 10).padStart(2, "0")}</span><strong>{preset.preset_key.replaceAll("_", " ")}</strong></div>
              <label>Button title<input name="label" defaultValue={preset.label} required /></label>
              <label>Generator treatment<select name="generator_mode" defaultValue={preset.generator_mode}>{generatorModes.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
              <label>Caption<textarea name="caption" defaultValue={preset.caption} rows={8} required /></label>
              <button className="admin-primary-button" type="submit"><Save size={15} /> Save caption</button>
            </form>
          ))}
        </div>
      </section>

      <section className="ingreign-admin-section">
        <div className="ingreign-admin-section-heading"><div><CalendarPlus size={18} /><span><strong>Manual calendar entries</strong><small>Add special posting days outside the automatic March–December first-Friday schedule.</small></span></div></div>
        <form action={saveIngreignManualEvent} className="admin-card ingreign-admin-event-form">
          <label>Internal title<input name="title" placeholder="Special gathering announcement" required /></label>
          <label>Calendar label<input name="calendar_label" placeholder="Special event post" required /></label>
          <label>Date<input name="event_date" type="date" required /></label>
          <label>Caption preset<select name="preset_key" defaultValue="date_post"><option value="">No preset</option>{data.presets.map((preset) => <option value={preset.preset_key} key={preset.id}>{preset.label}</option>)}</select></label>
          <label>Generator treatment<select name="generator_mode" defaultValue="date_only">{generatorModes.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
          <label>Month override<input name="month_label" placeholder="Auto from date" /></label>
          <label>Day override<input name="day_label" placeholder="Auto" maxLength={4} /></label>
          <label className="form-span">Caption override<textarea name="caption_override" rows={5} placeholder="Leave blank to use the selected preset." /></label>
          <label className="toggle-field form-span"><input name="notification_enabled" type="checkbox" defaultChecked /><span><strong>Send a posting reminder</strong><small>Delivered at 9:00 am Brisbane time on this date.</small></span></label>
          <div className="form-span"><button className="admin-primary-button" type="submit"><CalendarPlus size={15} /> Add calendar entry</button></div>
        </form>

        <div className="ingreign-admin-event-list">
          {data.manualEvents.map((event) => (
            <article className="admin-card" key={event.id}>
              <div><time dateTime={event.event_date}>{new Intl.DateTimeFormat("en-AU", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${event.event_date}T00:00:00Z`))}</time><h3>{event.calendar_label}</h3><p>{event.title} · {event.generator_mode.replaceAll("_", " ")}</p></div>
              <span className={event.notification_enabled ? "is-on" : undefined}><BellRing size={14} /> {event.notification_enabled ? "Reminder on" : "Reminder off"}</span>
              <form action={deleteIngreignManualEvent}><input type="hidden" name="id" value={event.id} /><button className="admin-danger-button" type="submit"><Trash2 size={15} /> Remove</button></form>
            </article>
          ))}
          {!data.manualEvents.length ? <div className="admin-card ingreign-admin-empty">No manual entries yet. The recurring schedule is already active.</div> : null}
        </div>
      </section>
    </>
  );
}

