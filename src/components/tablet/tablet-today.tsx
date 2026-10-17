"use client";

import { useMemo, type ReactNode } from "react";
import { format, parseISO } from "date-fns";
import {
  AlertTriangle,
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  CircleDot,
  Clock3,
  ListTodo,
  ListChecks,
  Megaphone,
  Pencil,
  Plane,
} from "lucide-react";
import { buildTabletTodayAgenda, type TabletTodayEntry, type TabletTodaySource } from "@/lib/tablet-today";
import type { CalendarCampaignAsset, CalendarCustomEvent, CalendarFlightEvent, CalendarItem, CalendarJob, CalendarTask } from "@/lib/types";

function EntryIcon({ kind }: { kind: TabletTodayEntry["kind"] }) {
  if (kind === "flight") return <Plane size={14} aria-hidden="true" />;
  if (kind === "event") return <CalendarClock size={14} aria-hidden="true" />;
  if (kind === "job") return <BriefcaseBusiness size={14} aria-hidden="true" />;
  if (kind === "campaign") return <Megaphone size={14} aria-hidden="true" />;
  return <ListTodo size={14} aria-hidden="true" />;
}

function AgendaCard({ editable, entry, onOpen }: { editable: boolean; entry: TabletTodayEntry; onOpen?: (source: TabletTodaySource) => void }) {
  const content = (
    <>
      <span className="tablet-today-entry-icon"><EntryIcon kind={entry.kind} /></span>
      <span className="tablet-today-entry-copy">
        <span className="tablet-today-entry-kicker">
          {entry.urgency === "overdue" ? "Overdue" : entry.urgency === "due" ? "Due today" : entry.kind}
        </span>
        <strong>{entry.title}</strong>
        <small>{entry.context}</small>
        {entry.meta ? <em>{entry.meta}</em> : null}
      </span>
      <span className="tablet-today-entry-side">
        {entry.time ? <time>{entry.time}</time> : null}
        {editable ? <Pencil size={12} aria-label="Edit" /> : null}
      </span>
    </>
  );

  return editable ? (
    <button type="button" className={`tablet-today-entry tone-${entry.tone}`} onClick={() => onOpen?.(entry.source)}>
      {content}
    </button>
  ) : (
    <article className={`tablet-today-entry tone-${entry.tone}`}>{content}</article>
  );
}

function AgendaSection({
  editable,
  empty,
  entries,
  eyebrow,
  icon,
  onOpen,
  title,
}: {
  editable: boolean;
  empty: string;
  entries: TabletTodayEntry[];
  eyebrow: string;
  icon: ReactNode;
  onOpen?: (source: TabletTodaySource) => void;
  title: string;
}) {
  return (
    <section className="tablet-today-section">
      <header>
        <span>{icon}</span>
        <div><small>{eyebrow}</small><h2>{title}</h2></div>
        <b>{entries.length}</b>
      </header>
      <div className="tablet-today-list">
        {entries.length ? entries.map((entry) => <AgendaCard editable={editable} entry={entry} key={entry.id} onOpen={onOpen} />) : (
          <div className="tablet-today-empty"><CheckCircle2 size={19} /><span>{empty}</span></div>
        )}
      </div>
    </section>
  );
}

export function TabletToday({
  accentClientName,
  accentKeywords,
  campaignAssets = [],
  customEvents = [],
  editable = false,
  flightEvents = [],
  jobs,
  onOpenCustomEvent,
  onOpenFlight,
  onOpenItem,
  tasks,
  today,
}: {
  accentClientName?: string;
  accentKeywords?: string[];
  campaignAssets?: CalendarCampaignAsset[];
  customEvents?: CalendarCustomEvent[];
  editable?: boolean;
  flightEvents?: CalendarFlightEvent[];
  jobs: CalendarJob[];
  onOpenCustomEvent?: (event: CalendarCustomEvent) => void;
  onOpenFlight?: (event: CalendarFlightEvent) => void;
  onOpenItem?: (item: CalendarItem) => void;
  tasks: CalendarTask[];
  today: string;
}) {
  const agenda = useMemo(() => buildTabletTodayAgenda({
    accentClientName,
    accentKeywords,
    campaignAssets,
    customEvents,
    flightEvents,
    jobs,
    tasks,
    today,
  }), [accentClientName, accentKeywords, campaignAssets, customEvents, flightEvents, jobs, tasks, today]);
  const dateLabel = useMemo(() => format(parseISO(today), "EEEE, d MMMM"), [today]);
  const hasAnything = agenda.schedule.length + agenda.priority.length + agenda.inProgress.length > 0;

  function openEntry(source: TabletTodaySource) {
    if (source.entity_type === "calendar-event") onOpenCustomEvent?.(source);
    else if (source.entity_type === "flight-event") onOpenFlight?.(source);
    else onOpenItem?.(source);
  }

  return (
    <section className="tablet-today" data-testid="today-view" aria-label="Today's itinerary">
      <header className="tablet-today-hero">
        <div>
          <span className="tablet-today-eyebrow"><CircleDot size={11} /> Today · {dateLabel}</span>
          <h1>Today&apos;s production plan</h1>
          <p>{hasAnything ? "Your schedule, deadlines and active work in one focused view." : "Nothing is waiting on you today."}</p>
        </div>
        <div className="tablet-today-stats" aria-label="Today summary">
          <article><span>Schedule</span><strong>{agenda.counts.scheduled}</strong></article>
          <article><span>Due</span><strong>{agenda.counts.dueToday}</strong></article>
          <article className={agenda.counts.overdue ? "has-alert" : ""}><span>Overdue</span><strong>{agenda.counts.overdue}</strong></article>
          <article><span>Active</span><strong>{agenda.counts.inProgress}</strong></article>
        </div>
      </header>

      <div className="tablet-today-grid">
        <AgendaSection
          editable={editable}
          empty="No events, flights or shoots scheduled."
          entries={agenda.schedule}
          eyebrow="In time order"
          icon={<Clock3 size={16} />}
          onOpen={openEntry}
          title="Schedule"
        />
        <div className="tablet-today-action-column">
          <AgendaSection
            editable={editable}
            empty="No overdue work or deadlines today."
            entries={agenda.priority}
            eyebrow="Do these first"
            icon={<AlertTriangle size={16} />}
            onOpen={openEntry}
            title="Priority actions"
          />
          <AgendaSection
            editable={editable}
            empty="No work is currently in progress."
            entries={agenda.inProgress}
            eyebrow="Keep moving"
            icon={<ListChecks size={16} />}
            onOpen={openEntry}
            title="In progress"
          />
        </div>
      </div>
    </section>
  );
}
