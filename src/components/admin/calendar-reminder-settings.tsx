import { BellRing, Clock3, Save, ShieldCheck } from "lucide-react";
import { updateCalendarReminderSettings } from "@/app/admin/actions";
import { SubmitButton } from "@/components/admin/submit-button";
import type { CalendarReminderSettings } from "@/lib/calendar-reminder-logic";

export function CalendarReminderSettingsPanel({ settings }: { settings: CalendarReminderSettings }) {
  return (
    <section className="admin-card calendar-reminder-settings">
      <div className="calendar-reminder-intro">
        <span><BellRing size={16} /> Proactive reminders</span>
        <h2>Stay ahead of every production deadline</h2>
        <p>TruShot checks the schedule every 15 minutes and sends each alert once to your registered devices. Date-only work uses the default time below.</p>
        <small><ShieldCheck size={14} /> Australia/Brisbane · server scheduled · no tablet polling</small>
      </div>
      <form action={updateCalendarReminderSettings} className="calendar-reminder-form">
        <label className="calendar-reminder-master">
          <span><strong>Calendar push reminders</strong><small>Pause or resume all scheduled alerts.</small></span>
          <input type="checkbox" name="enabled" defaultChecked={settings.enabled} />
        </label>
        <div className="calendar-reminder-timing">
          <label><Clock3 size={14} /> Notify before<input type="number" name="lead_hours" min="0.25" max="168" step="0.25" defaultValue={settings.lead_minutes / 60} /><small>hours</small></label>
          <label><Clock3 size={14} /> Date-only time<input type="time" name="default_event_time" required defaultValue={settings.default_event_time.slice(0, 5)} /></label>
        </div>
        <div className="calendar-reminder-options">
          <label><input type="checkbox" name="send_at_event_time" defaultChecked={settings.send_at_event_time} /><span><strong>At event time</strong><small>Send a second alert when it starts or becomes due.</small></span></label>
          <label><input type="checkbox" name="notify_job_starts" defaultChecked={settings.notify_job_starts} /><span><strong>Job starts</strong><small>Shoots and production start dates.</small></span></label>
          <label><input type="checkbox" name="notify_job_deadlines" defaultChecked={settings.notify_job_deadlines} /><span><strong>Job deadlines</strong><small>Final job delivery dates.</small></span></label>
          <label><input type="checkbox" name="notify_task_deadlines" defaultChecked={settings.notify_task_deadlines} /><span><strong>Task deadlines</strong><small>Individual assets and task due dates.</small></span></label>
          <label><input type="checkbox" name="notify_campaign_assets" defaultChecked={settings.notify_campaign_assets} /><span><strong>Campaign assets</strong><small>Campaign asset starts and deadlines.</small></span></label>
        </div>
        <SubmitButton pendingLabel="Saving reminders…"><Save size={14} /> Save reminder settings</SubmitButton>
      </form>
    </section>
  );
}
