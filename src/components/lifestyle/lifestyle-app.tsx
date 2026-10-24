"use client";

import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  BellRing,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock3,
  Dumbbell,
  Flame,
  HeartPulse,
  Info,
  LogOut,
  Minus,
  RotateCcw,
  Settings2,
  ShieldCheck,
  Sparkles,
  Target,
  TimerReset,
  TrendingUp,
  X,
  Zap,
} from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  completeLifestyleSession,
  saveLifestyleCheckin,
  saveLifestyleExercise,
  saveLifestyleSettings,
  signOutOfLifestyle,
  skipLifestyleSession,
} from "@/app/lifestyle/actions";
import { LifestyleNotifications } from "@/components/lifestyle/lifestyle-notifications";
import type { LifestyleCheckin, LifestyleExercise, LifestyleProfile, LifestyleSession } from "@/lib/data/lifestyle";
import { getLifestyleExerciseGuide } from "@/lib/lifestyle-exercise-guides";

type LifestyleData = {
  today: string;
  profile: LifestyleProfile;
  sessions: LifestyleSession[];
  checkins: LifestyleCheckin[];
  subscriptionCount: number;
};

type View = "today" | "plan" | "progress" | "settings";
type CalendarMode = "week" | "fortnight" | "month";

const VIEWS: { key: View; label: string; Icon: typeof Activity }[] = [
  { key: "today", label: "Today", Icon: Activity },
  { key: "plan", label: "Plan", Icon: CalendarDays },
  { key: "progress", label: "Progress", Icon: BarChart3 },
  { key: "settings", label: "Settings", Icon: Settings2 },
];

const REMINDER_OPTIONS = [
  { value: 600, label: "Morning nudge" },
  { value: 120, label: "2 hours before" },
  { value: 30, label: "30 minutes before" },
  { value: 0, label: "At start time" },
];

function parseView(value?: string): View {
  return VIEWS.some((view) => view.key === value) ? value as View : "today";
}

function displayTime(value: string) {
  const [hours, minutes] = value.slice(0, 5).split(":").map(Number);
  return new Intl.DateTimeFormat("en-AU", { hour: "numeric", minute: "2-digit" }).format(new Date(2020, 0, 1, hours, minutes));
}

function percentage(value: number, total: number) {
  return total ? Math.round((value / total) * 100) : 0;
}

function friendlyDate(value: string) {
  return format(parseISO(value), "EEEE, d MMMM");
}

function setUrlView(view: View) {
  const url = new URL(window.location.href);
  url.searchParams.set("view", view);
  url.searchParams.delete("session");
  window.history.replaceState({}, "", url);
}

function AppMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`lifestyle-app-mark ${compact ? "is-compact" : ""}`} aria-hidden="true">
      <Activity />
      <Dumbbell />
    </span>
  );
}

function MovementStudy({ exerciseKey, name, compact = false }: { exerciseKey: string; name: string; compact?: boolean }) {
  const guide = getLifestyleExerciseGuide(exerciseKey);
  if (!guide) {
    return <span className={`lifestyle-movement-study ${compact ? "is-compact" : ""} is-fallback`} aria-hidden="true"><Dumbbell /></span>;
  }
  return (
    <figure className={`lifestyle-movement-study ${compact ? "is-compact" : ""}`}>
      <Image src={guide.image} width={960} height={960} sizes={compact ? "(max-width: 640px) 68px, 100px" : "(max-width: 640px) calc(100vw - 84px), 680px"} alt={guide.imageAlt} />
      {!compact ? <figcaption><span>Start</span><i aria-hidden="true" /><span>Finish</span></figcaption> : null}
      {compact ? <span className="sr-only">Open {name} instructions to view the full movement study.</span> : null}
    </figure>
  );
}

function SessionPill({ session, onOpen }: { session: LifestyleSession; onOpen: (session: LifestyleSession) => void }) {
  const completeCount = session.exercises.filter((exercise) => exercise.completed).length;
  return (
    <button type="button" className={`lifestyle-session-pill is-${session.status}`} onClick={() => onOpen(session)}>
      <span>{session.status === "completed" ? <CheckCircle2 size={15} /> : <Dumbbell size={15} />}</span>
      <div><strong>{session.title}</strong><small>{displayTime(session.start_time)} · {completeCount}/{session.exercises.length} movements</small></div>
      <ChevronRight size={16} />
    </button>
  );
}

function ExerciseCard({ exercise, onSave, disabled }: { exercise: LifestyleExercise; onSave: (input: { exerciseId: string; completed: boolean; completedSets: number; weightKg: number | null; repsCompleted: number | null }) => void; disabled: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [weight, setWeight] = useState(exercise.weight_kg?.toString() ?? "");
  const [reps, setReps] = useState(exercise.reps_completed?.toString() ?? "");
  const guide = getLifestyleExerciseGuide(exercise.exercise_key);
  return (
    <article className={`lifestyle-exercise-card ${exercise.completed ? "is-complete" : ""}`}>
      <button
        type="button"
        className="lifestyle-exercise-check"
        aria-label={exercise.completed ? `Mark ${exercise.name} incomplete` : `Complete ${exercise.name}`}
        disabled={disabled}
        onClick={() => onSave({
          exerciseId: exercise.id,
          completed: !exercise.completed,
          completedSets: !exercise.completed ? exercise.target_sets : 0,
          weightKg: weight ? Number(weight) : null,
          repsCompleted: reps ? Number(reps) : null,
        })}
      >{exercise.completed ? <Check size={18} /> : <Circle size={18} />}</button>
      <MovementStudy exerciseKey={exercise.exercise_key} name={exercise.name} compact />
      <div className="lifestyle-exercise-copy">
        <button type="button" className="lifestyle-exercise-title" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>
          <span><strong>{exercise.name}</strong><small>{exercise.target_sets} sets · {exercise.rep_min}–{exercise.rep_max} reps · {exercise.rest_seconds}s rest</small></span>
          <ChevronDown size={17} />
        </button>
        <div className="lifestyle-exercise-log">
          <label>Weight<input inputMode="decimal" value={weight} onChange={(event) => setWeight(event.target.value)} placeholder="—" /><span>kg</span></label>
          <label>Last reps<input inputMode="numeric" value={reps} onChange={(event) => setReps(event.target.value)} placeholder="—" /></label>
        </div>
      </div>
      {expanded ? (
        <div className="lifestyle-form-guide">
            {guide ? (
              <>
                <MovementStudy exerciseKey={exercise.exercise_key} name={exercise.name} />
                <header>
                  <span><Activity size={15} /> Movement guide</span>
                  <strong>{guide.goal}</strong>
                </header>
                <div className="lifestyle-muscle-map">
                  <div><span>Primary</span><p>{guide.primaryMuscles.map((muscle) => <i key={muscle}>{muscle}</i>)}</p></div>
                  <div><span>Supporting</span><p>{guide.supportingMuscles.map((muscle) => <i key={muscle}>{muscle}</i>)}</p></div>
                </div>
                <div className="lifestyle-instruction-grid">
                  <section>
                    <span>01 · Set up</span>
                    <ol>{guide.setup.map((step) => <li key={step}>{step}</li>)}</ol>
                  </section>
                  <section>
                    <span>02 · Do the rep</span>
                    <ol>{guide.movement.map((step) => <li key={step}>{step}</li>)}</ol>
                  </section>
                  <section className="is-breathing">
                    <span>03 · Breathe + brace</span>
                    <p>{guide.breathing}</p>
                  </section>
                  <section className="is-mistakes">
                    <span>Watch for</span>
                    <ul>{guide.commonMistakes.map((mistake) => <li key={mistake}>{mistake}</li>)}</ul>
                  </section>
                </div>
                <div className="lifestyle-regression"><RotateCcw size={15} /><p><strong>Make it easier</strong>{guide.easierOption}</p></div>
              </>
            ) : (
              <>
                <strong>Form checkpoints</strong>
                <ol>{exercise.form_cues.map((cue) => <li key={cue}>{cue}</li>)}</ol>
              </>
            )}
            <p className="lifestyle-guide-caution"><Info size={14} /> Use a pain-free range. Stop for sharp, radiating or worsening pain.</p>
        </div>
      ) : null}
    </article>
  );
}

function WorkoutSheet({ session, onClose, onExerciseSave, onComplete, onSkip, pending }: {
  session: LifestyleSession;
  onClose: () => void;
  onExerciseSave: (input: { exerciseId: string; completed: boolean; completedSets: number; weightKg: number | null; repsCompleted: number | null }) => void;
  onComplete: (id: string) => void;
  onSkip: (id: string) => void;
  pending: boolean;
}) {
  const completeCount = session.exercises.filter((exercise) => exercise.completed).length;
  const completion = percentage(completeCount, session.exercises.length);
  useEffect(() => {
    const close = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);
  return (
    <div className="lifestyle-sheet-layer" role="presentation">
      <button type="button" className="lifestyle-sheet-backdrop" onClick={onClose} aria-label="Close workout" />
      <section className="lifestyle-workout-sheet" role="dialog" aria-modal="true" aria-labelledby="lifestyle-workout-title">
        <header>
          <button type="button" onClick={onClose} aria-label="Close workout"><X size={21} /></button>
          <span>{friendlyDate(session.session_date)}</span>
          <i>{completion}%</i>
        </header>
        <div className="lifestyle-workout-heading">
          <span><Dumbbell size={18} /> {displayTime(session.start_time)}–{displayTime(session.end_time)}</span>
          <h2 id="lifestyle-workout-title">{session.title}</h2>
          <p>{session.focus}</p>
          <div className="lifestyle-progress-track"><i style={{ width: `${completion}%` }} /></div>
          <small>{completeCount} of {session.exercises.length} movements complete</small>
        </div>
        <div className="lifestyle-workout-safety"><ShieldCheck size={17} /><p><strong>Train the body you have today.</strong> Stop if pain is sharp, radiating or worsening. Form first; load second.</p></div>
        <div className="lifestyle-exercise-list">
          {session.exercises.map((exercise) => <ExerciseCard key={exercise.id} exercise={exercise} onSave={onExerciseSave} disabled={pending} />)}
        </div>
        <footer>
          <button type="button" className="is-quiet" onClick={() => onSkip(session.id)} disabled={pending || session.status === "completed"}><Minus size={16} /> Skip today</button>
          <button type="button" className="is-primary" onClick={() => onComplete(session.id)} disabled={pending || session.status === "completed"}><Check size={17} /> {session.status === "completed" ? "Workout complete" : "Complete workout"}</button>
        </footer>
      </section>
    </div>
  );
}

function TodayView({ today, sessions, onOpen }: { today: string; sessions: LifestyleSession[]; onOpen: (session: LifestyleSession) => void }) {
  const todaySession = sessions.find((session) => session.session_date === today && session.status !== "skipped");
  const nextSession = sessions.find((session) => session.session_date > today && session.status === "scheduled");
  const thisWeekStart = format(startOfWeek(parseISO(today), { weekStartsOn: 1 }), "yyyy-MM-dd");
  const thisWeekEnd = format(endOfWeek(parseISO(today), { weekStartsOn: 1 }), "yyyy-MM-dd");
  const weekSessions = sessions.filter((session) => session.session_date >= thisWeekStart && session.session_date <= thisWeekEnd);
  const weekComplete = weekSessions.filter((session) => session.status === "completed").length;
  return (
    <div className="lifestyle-view lifestyle-today-view">
      <section className="lifestyle-hero">
        <div className="lifestyle-hero-copy">
          <span><Sparkles size={15} /> {format(parseISO(today), "EEEE · d MMMM")}</span>
          <h1>{todaySession ? "Today, we train." : "Recovery is training, too."}</h1>
          <p>{todaySession ? todaySession.focus : nextSession ? `Your next session is ${format(parseISO(nextSession.session_date), "EEEE")}. Today is for walking, mobility and a little patience.` : "Your next training block is being prepared."}</p>
          {todaySession ? <button type="button" onClick={() => onOpen(todaySession)}>Open today’s workout <ArrowRight size={17} /></button> : null}
        </div>
        <div className="lifestyle-week-ring" style={{ "--progress": `${percentage(weekComplete, weekSessions.length)}%` } as React.CSSProperties}>
          <div><strong>{weekComplete}<small>/{weekSessions.length}</small></strong><span>this week</span></div>
        </div>
      </section>

      <section className="lifestyle-today-grid">
        <article className="lifestyle-focus-card">
          <header><span><Target size={16} /> Current focus</span><i>RETURN BLOCK</i></header>
          <h2>Rebuild the base.</h2>
          <p>Full-body strength with deliberate glute, posterior-chain and trunk work—progressive enough to work, restrained enough to repeat.</p>
          <div><span><Dumbbell size={15} /> Strength + muscle</span><span><TimerReset size={15} /> 8-week runway</span></div>
        </article>
        <article className="lifestyle-next-card">
          <header><span><Clock3 size={16} /> {todaySession ? "Today’s session" : "Up next"}</span></header>
          {todaySession || nextSession ? <SessionPill session={todaySession ?? nextSession!} onOpen={onOpen} /> : <p>No upcoming session yet.</p>}
          <small><ShieldCheck size={14} /> Scheduled around existing timed events and flights.</small>
        </article>
      </section>

      <section className="lifestyle-rules">
        <article><span><Zap /></span><div><strong>Leave 2–3 reps in reserve</strong><p>Weeks one and two are about repeatable effort—not proving anything.</p></div></article>
        <article><span><TrendingUp /></span><div><strong>Progress one variable</strong><p>Reach the top of the rep range with clean form, then add the smallest load.</p></div></article>
        <article><span><HeartPulse /></span><div><strong>Pain changes the plan</strong><p>Muscle effort is expected; sharp, radiating or worsening pain is a stop signal.</p></div></article>
      </section>
    </div>
  );
}

function PlanView({ today, sessions, onOpen }: { today: string; sessions: LifestyleSession[]; onOpen: (session: LifestyleSession) => void }) {
  const [mode, setMode] = useState<CalendarMode>("week");
  const [cursor, setCursor] = useState(() => parseISO(today));
  const days = useMemo(() => {
    if (mode === "month") {
      return eachDayOfInterval({
        start: startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 }),
        end: endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 }),
      });
    }
    const start = startOfWeek(cursor, { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end: addDays(start, mode === "week" ? 6 : 13) });
  }, [cursor, mode]);
  const move = (direction: number) => setCursor((value) => mode === "month" ? addMonths(value, direction) : addWeeks(value, direction * (mode === "week" ? 1 : 2)));
  const title = mode === "month"
    ? format(cursor, "MMMM yyyy")
    : `${format(days[0], "d MMM")} – ${format(days[days.length - 1], "d MMM yyyy")}`;
  return (
    <div className="lifestyle-view lifestyle-plan-view">
      <header className="lifestyle-page-title"><div><span><CalendarDays size={15} /> Conflict-aware plan</span><h1>Your training<br />in context.</h1></div><p>The work calendar stays invisible here; Lifestyle only uses it to find a cleaner place for each session.</p></header>
      <section className="lifestyle-calendar-shell">
        <header className="lifestyle-calendar-toolbar">
          <div className="lifestyle-period-controls"><button type="button" onClick={() => move(-1)} aria-label="Previous period"><ArrowLeft /></button><button type="button" onClick={() => setCursor(parseISO(today))}>Today</button><button type="button" onClick={() => move(1)} aria-label="Next period"><ArrowRight /></button></div>
          <strong>{title}</strong>
          <div className="lifestyle-mode-switch">{(["week", "fortnight", "month"] as CalendarMode[]).map((value) => <button type="button" key={value} className={mode === value ? "is-active" : ""} onClick={() => setMode(value)}>{value === "fortnight" ? "2 weeks" : value}</button>)}</div>
        </header>
        <div className={`lifestyle-calendar is-${mode}`}>
          {days.slice(0, 7).map((day) => <span className="lifestyle-calendar-weekday" key={day.toISOString()}>{format(day, "EEE")}</span>)}
          {days.map((day) => {
            const date = format(day, "yyyy-MM-dd");
            const session = sessions.find((item) => item.session_date === date);
            return (
              <button type="button" key={date} className={`lifestyle-calendar-day ${date === today ? "is-today" : ""} ${!isSameMonth(day, cursor) && mode === "month" ? "is-outside" : ""} ${session ? `has-session is-${session.status}` : ""}`} onClick={() => session && onOpen(session)} disabled={!session}>
                <span>{format(day, "d")}</span>
                {session ? <div><i>{session.status === "completed" ? <Check size={13} /> : <Dumbbell size={13} />}</i><strong>{session.title}</strong><small>{displayTime(session.start_time)}</small></div> : <small className="lifestyle-rest-label">{day.getDay() === 0 || day.getDay() === 6 ? "Recover" : ""}</small>}
              </button>
            );
          })}
        </div>
        <footer><span><i className="is-scheduled" /> Scheduled</span><span><i className="is-completed" /> Completed</span><span><i className="is-skipped" /> Skipped</span><small><ShieldCheck size={13} /> Only workouts appear here</small></footer>
      </section>
    </div>
  );
}

function ProgressView({ today, sessions, checkins, onSaved }: { today: string; sessions: LifestyleSession[]; checkins: LifestyleCheckin[]; onSaved: () => void }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const recentStart = format(addDays(parseISO(today), -27), "yyyy-MM-dd");
  const recent = sessions.filter((session) => session.session_date >= recentStart && session.session_date <= today);
  const completed = recent.filter((session) => session.status === "completed").length;
  const scheduled = recent.filter((session) => session.status !== "skipped").length;
  const totalMovements = recent.reduce((total, session) => total + session.exercises.filter((exercise) => exercise.completed).length, 0);
  const weekStarts = Array.from({ length: 4 }, (_, index) => addWeeks(startOfWeek(parseISO(today), { weekStartsOn: 1 }), index - 3));
  let streak = 0;
  for (const session of [...recent].sort((a, b) => b.session_date.localeCompare(a.session_date))) {
    if (session.status === "completed") streak += 1;
    else if (session.session_date <= today && session.status !== "skipped") break;
  }
  function submitCheckin(formData: FormData) {
    startTransition(async () => {
      try {
        await saveLifestyleCheckin({
          date: today,
          weightKg: formData.get("weight") ? Number(formData.get("weight")) : null,
          energy: formData.get("energy") ? Number(formData.get("energy")) : null,
          sleepHours: formData.get("sleep") ? Number(formData.get("sleep")) : null,
          note: String(formData.get("note") ?? "").trim() || null,
        });
        setMessage("Check-in saved. Quiet consistency counts.");
        onSaved();
      } catch (error) { setMessage(error instanceof Error ? error.message : "Check-in could not be saved."); }
    });
  }
  return (
    <div className="lifestyle-view lifestyle-progress-view">
      <header className="lifestyle-page-title"><div><span><BarChart3 size={15} /> Progress</span><h1>Evidence that<br />you showed up.</h1></div><p>No punishment metrics. Just a clear record of the work that compounds.</p></header>
      <section className="lifestyle-stat-grid">
        <article><span><Target /></span><strong>{percentage(completed, scheduled)}%</strong><p>28-day consistency</p></article>
        <article><span><Flame /></span><strong>{streak}</strong><p>session streak</p></article>
        <article><span><Dumbbell /></span><strong>{completed}</strong><p>workouts completed</p></article>
        <article><span><Check /></span><strong>{totalMovements}</strong><p>movements checked off</p></article>
      </section>
      <section className="lifestyle-progress-grid">
        <article className="lifestyle-weekly-chart">
          <header><div><span>Last four weeks</span><strong>Training rhythm</strong></div><TrendingUp /></header>
          <div>{weekStarts.map((weekStart) => {
            const start = format(weekStart, "yyyy-MM-dd");
            const end = format(endOfWeek(weekStart, { weekStartsOn: 1 }), "yyyy-MM-dd");
            const week = sessions.filter((session) => session.session_date >= start && session.session_date <= end);
            const done = week.filter((session) => session.status === "completed").length;
            const total = week.filter((session) => session.status !== "skipped").length;
            return <div key={start}><span><i style={{ height: `${Math.max(8, percentage(done, Math.max(total, 1)))}%` }} /></span><strong>{done}/{total}</strong><small>{format(weekStart, "d MMM")}</small></div>;
          })}</div>
        </article>
        <form className="lifestyle-checkin" action={submitCheckin}>
          <header><div><span>Today</span><strong>Quick check-in</strong></div><HeartPulse /></header>
          <div className="lifestyle-checkin-fields">
            <label>Weight <span>kg</span><input name="weight" type="number" inputMode="decimal" step="0.1" defaultValue={checkins[0]?.checkin_date === today ? checkins[0].weight_kg ?? "" : ""} placeholder="70.0" /></label>
            <label>Sleep <span>hours</span><input name="sleep" type="number" inputMode="decimal" step="0.5" placeholder="7.5" /></label>
            <label>Energy <select name="energy" defaultValue=""><option value="">Choose</option><option value="1">1 · Flat</option><option value="2">2 · Low</option><option value="3">3 · Okay</option><option value="4">4 · Good</option><option value="5">5 · Excellent</option></select></label>
            <label className="is-wide">Note <textarea name="note" rows={3} placeholder="How is the body feeling today?" /></label>
          </div>
          <button type="submit" disabled={pending}>{pending ? "Saving…" : "Save check-in"}</button>
          {message ? <p role="status">{message}</p> : null}
        </form>
      </section>
    </div>
  );
}

function SettingsView({ profile, publicKey, deviceCount, onSaved }: { profile: LifestyleProfile; publicKey: string; deviceCount: number; onSaved: () => void }) {
  const [pending, startTransition] = useTransition();
  const [days, setDays] = useState(profile.days_per_week);
  const [duration, setDuration] = useState(profile.session_duration_minutes);
  const [time, setTime] = useState(profile.preferred_start_time.slice(0, 5));
  const [height, setHeight] = useState(profile.height_cm?.toString() ?? "");
  const [weight, setWeight] = useState(profile.weight_kg?.toString() ?? "");
  const [reminders, setReminders] = useState(profile.reminder_offsets_minutes);
  const [acknowledged, setAcknowledged] = useState(Boolean(profile.safety_acknowledged_at));
  const [message, setMessage] = useState("");
  function toggleReminder(value: number) {
    setReminders((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value].sort((a, b) => b - a));
  }
  function save() {
    startTransition(async () => {
      try {
        await saveLifestyleSettings({
          daysPerWeek: days,
          sessionDurationMinutes: duration,
          preferredStartTime: time,
          reminderOffsetsMinutes: reminders,
          heightCm: height ? Number(height) : null,
          weightKg: weight ? Number(weight) : null,
          safetyAcknowledged: acknowledged,
        });
        setMessage("Your plan has been rebuilt around the latest calendar conflicts.");
        onSaved();
      } catch (error) { setMessage(error instanceof Error ? error.message : "Settings could not be saved."); }
    });
  }
  return (
    <div className="lifestyle-view lifestyle-settings-view">
      <header className="lifestyle-page-title"><div><span><Settings2 size={15} /> Settings</span><h1>Make the plan<br />fit real life.</h1></div><p>Change the commitment, timing or reminders. Future sessions will be rebuilt without rewriting completed history.</p></header>
      <div className="lifestyle-settings-grid">
        <section className="lifestyle-settings-card">
          <header><div><span>01</span><strong>Training rhythm</strong></div><RotateCcw /></header>
          <label className="lifestyle-setting-label">Sessions per week <small>Start repeatable. Three is the recommended return point.</small></label>
          <div className="lifestyle-segmented">{[2, 3, 4, 5].map((value) => <button key={value} type="button" className={days === value ? "is-active" : ""} onClick={() => setDays(value)}><strong>{value}</strong><span>days</span></button>)}</div>
          <div className="lifestyle-setting-row"><label>Preferred start<input type="time" value={time} onChange={(event) => setTime(event.target.value)} /></label><label>Session length<select value={duration} onChange={(event) => setDuration(Number(event.target.value))}><option value={45}>45 minutes</option><option value={60}>60 minutes</option><option value={75}>75 minutes</option><option value={90}>90 minutes</option></select></label></div>
          <p className="lifestyle-setting-note"><ShieldCheck size={15} /> Lifestyle will try nearby times and days before accepting a clash with an existing timed event.</p>
        </section>
        <section className="lifestyle-settings-card">
          <header><div><span>02</span><strong>Profile + reminders</strong></div><BellRing /></header>
          <div className="lifestyle-setting-row"><label>Height <span>cm</span><input type="number" inputMode="decimal" value={height} onChange={(event) => setHeight(event.target.value)} /></label><label>Weight <span>kg</span><input type="number" inputMode="decimal" step="0.1" value={weight} onChange={(event) => setWeight(event.target.value)} /></label></div>
          <label className="lifestyle-setting-label">Reminder moments <small>Choose up to four; later reminders replace earlier ones on screen.</small></label>
          <div className="lifestyle-reminder-grid">{REMINDER_OPTIONS.map((option) => <button key={option.value} type="button" className={reminders.includes(option.value) ? "is-active" : ""} onClick={() => toggleReminder(option.value)}><span>{reminders.includes(option.value) ? <Check size={15} /> : null}</span>{option.label}</button>)}</div>
        </section>
        <section className="lifestyle-settings-card is-safety">
          <header><div><span>03</span><strong>Training readiness</strong></div><HeartPulse /></header>
          <p>This planner provides general fitness programming, not medical diagnosis or rehabilitation. Back pain deserves individual assessment—especially if it is new, worsening, affects daily life, or includes weakness, numbness, bladder/bowel changes, fever or unexplained weight loss.</p>
          <label className="lifestyle-acknowledgement"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} /><span><i>{acknowledged ? <Check size={15} /> : null}</i><strong>I’ll use pain-free ranges, progress gradually and seek professional advice when needed.</strong></span></label>
          <a href="https://www.healthdirect.gov.au/low-back-pain" target="_blank" rel="noreferrer">Australian back-pain guidance <ArrowRight size={14} /></a>
        </section>
        <LifestyleNotifications publicKey={publicKey} deviceCount={deviceCount} />
      </div>
      <div className="lifestyle-save-bar"><div><strong>Ready to rebuild?</strong><span>Completed sessions stay exactly where they are.</span></div><button type="button" onClick={save} disabled={pending || !acknowledged}>{pending ? "Rebuilding…" : "Save + rebuild future plan"}</button></div>
      {message ? <p className="lifestyle-settings-message" role="status">{message}</p> : null}
      <section className="lifestyle-evidence">
        <strong><ShieldCheck size={16} /> Programming basis</strong>
        <p>The default plan prioritises consistency, all-major-muscle-group training, gradual progression and recoverable weekly volume.</p>
        <div><a href="https://acsm.org/resistance-training-guidelines-update-2026/" target="_blank" rel="noreferrer">ACSM 2026 resistance training guidance</a><a href="https://www.who.int/europe/news-room/fact-sheets/item/physical-activity" target="_blank" rel="noreferrer">WHO adult physical activity guidance</a></div>
      </section>
      <form action={signOutOfLifestyle} className="lifestyle-signout"><button type="submit"><LogOut size={16} /> Sign out of Lifestyle</button></form>
    </div>
  );
}

function SafetyOnboarding({ profile, onComplete }: { profile: LifestyleProfile; onComplete: () => void }) {
  const [pending, startTransition] = useTransition();
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState("");
  function continueToApp() {
    startTransition(async () => {
      try {
        await saveLifestyleSettings({
          daysPerWeek: profile.days_per_week,
          sessionDurationMinutes: profile.session_duration_minutes,
          preferredStartTime: profile.preferred_start_time.slice(0, 5),
          reminderOffsetsMinutes: profile.reminder_offsets_minutes,
          heightCm: profile.height_cm,
          weightKg: profile.weight_kg,
          safetyAcknowledged: checked,
        });
        onComplete();
      } catch (caught) { setError(caught instanceof Error ? caught.message : "Lifestyle could not be started."); }
    });
  }
  return (
    <div className="lifestyle-onboarding-layer">
      <section className="lifestyle-onboarding">
        <AppMark />
        <span>Before the first set</span>
        <h2>Strong starts with<br />honest feedback.</h2>
        <p>Lifestyle is general strength programming—not a diagnosis or rehabilitation plan. Because you mentioned back discomfort, begin conservatively and use only pain-free ranges.</p>
        <div><HeartPulse /><p><strong>Stop and get advice</strong> for sharp, radiating or worsening pain, weakness, numbness, bladder/bowel changes, fever, unexplained weight loss, or pain that disrupts daily life.</p></div>
        <label><input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} /><span><i>{checked ? <Check /> : null}</i>I understand, and I’ll seek appropriate medical or physiotherapy advice when needed.</span></label>
        <button type="button" onClick={continueToApp} disabled={!checked || pending}>{pending ? "Building your plan…" : "Build my return plan"} <ArrowRight /></button>
        {error ? <small role="alert">{error}</small> : null}
      </section>
    </div>
  );
}

export function LifestyleApp({ initialData, initialView, requestedSessionId, notificationPublicKey }: { initialData: LifestyleData; initialView?: string; requestedSessionId?: string; notificationPublicKey: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [view, setView] = useState<View>(() => parseView(initialView));
  const [sessions, setSessions] = useState(initialData.sessions);
  const [profile, setProfile] = useState(initialData.profile);
  const [selectedId, setSelectedId] = useState<string | null>(requestedSessionId ?? null);
  const [toast, setToast] = useState("");
  const selected = sessions.find((session) => session.id === selectedId) ?? null;

  useEffect(() => {
    const timer = window.setInterval(() => router.refresh(), 15 * 60_000);
    return () => window.clearInterval(timer);
  }, [router]);

  function navigate(next: View) { setView(next); setUrlView(next); }
  function refresh() { router.refresh(); }
  function openSession(session: LifestyleSession) {
    setSelectedId(session.id);
    const url = new URL(window.location.href);
    url.searchParams.set("session", session.id);
    window.history.replaceState({}, "", url);
  }
  function closeSession() {
    setSelectedId(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("session");
    window.history.replaceState({}, "", url);
  }
  function saveExercise(input: { exerciseId: string; completed: boolean; completedSets: number; weightKg: number | null; repsCompleted: number | null }) {
    setSessions((current) => current.map((session) => ({
      ...session,
      exercises: session.exercises.map((exercise) => exercise.id === input.exerciseId ? { ...exercise, completed: input.completed, completed_sets: input.completedSets, weight_kg: input.weightKg, reps_completed: input.repsCompleted } : exercise),
    })));
    startTransition(async () => {
      try { await saveLifestyleExercise(input); refresh(); }
      catch (error) { setToast(error instanceof Error ? error.message : "Exercise could not be saved."); refresh(); }
    });
  }
  function completeSession(id: string) {
    setSessions((current) => current.map((session) => session.id === id ? { ...session, status: "completed", exercises: session.exercises.map((exercise) => ({ ...exercise, completed: true })) } : session));
    startTransition(async () => {
      try { await completeLifestyleSession(id); setToast("Workout complete. That’s another vote for the person you’re becoming."); refresh(); }
      catch (error) { setToast(error instanceof Error ? error.message : "Workout could not be completed."); refresh(); }
    });
  }
  function skipSession(id: string) {
    startTransition(async () => {
      try { await skipLifestyleSession(id); setToast("Session skipped—no guilt. The next useful action still counts."); closeSession(); refresh(); }
      catch (error) { setToast(error instanceof Error ? error.message : "Workout could not be skipped."); }
    });
  }
  return (
    <main className="lifestyle-app">
      <header className="lifestyle-topbar">
        <button type="button" className="lifestyle-brand" onClick={() => navigate("today")}><AppMark compact /><span><strong>Lifestyle</strong><small>by TruShot</small></span></button>
        <div className="lifestyle-desktop-nav">{VIEWS.map(({ key, label, Icon }) => <button type="button" key={key} className={view === key ? "is-active" : ""} onClick={() => navigate(key)}><Icon size={17} />{label}</button>)}</div>
        <div className="lifestyle-status"><i /><span>Plan active</span></div>
      </header>
      <div className="lifestyle-main">
        {view === "today" ? <TodayView today={initialData.today} sessions={sessions} onOpen={openSession} /> : null}
        {view === "plan" ? <PlanView today={initialData.today} sessions={sessions} onOpen={openSession} /> : null}
        {view === "progress" ? <ProgressView today={initialData.today} sessions={sessions} checkins={initialData.checkins} onSaved={refresh} /> : null}
        {view === "settings" ? <SettingsView profile={profile} publicKey={notificationPublicKey} deviceCount={initialData.subscriptionCount} onSaved={refresh} /> : null}
      </div>
      <nav className="lifestyle-mobile-nav" aria-label="Lifestyle navigation">{VIEWS.map(({ key, label, Icon }) => <button type="button" key={key} className={view === key ? "is-active" : ""} onClick={() => navigate(key)}><Icon size={20} /><span>{label}</span></button>)}</nav>
      {selected ? <WorkoutSheet session={selected} onClose={closeSession} onExerciseSave={saveExercise} onComplete={completeSession} onSkip={skipSession} pending={pending} /> : null}
      {toast ? <button type="button" className="lifestyle-toast" onClick={() => setToast("")}><CheckCircle2 size={17} /><span>{toast}</span><X size={15} /></button> : null}
      {!profile.safety_acknowledged_at ? <SafetyOnboarding profile={profile} onComplete={() => { setProfile((current) => ({ ...current, safety_acknowledged_at: new Date().toISOString() })); refresh(); }} /> : null}
    </main>
  );
}
