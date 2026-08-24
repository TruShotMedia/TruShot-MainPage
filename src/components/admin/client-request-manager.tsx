"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Archive,
  ArchiveRestore,
  ArrowUpRight,
  Check,
  Clock3,
  Inbox,
  Mail,
  MessageSquareText,
  Phone,
  RotateCcw,
  Search,
  ShieldX,
  UserRoundCheck,
} from "lucide-react";
import {
  approveEnquiry,
  archiveRejectedEnquiry,
  markEnquiryReviewing,
  rejectEnquiry,
  reopenEnquiry,
  restoreArchivedEnquiry,
  updateEnquiryNotes,
} from "@/app/admin/actions";
import { ActionPopover } from "@/components/admin/action-popover";
import { EmptyState } from "@/components/admin/empty-state";
import { SubmitButton } from "@/components/admin/submit-button";
import { formatDate } from "@/lib/format";
import type { ClientEnquiry, EnquiryStatus } from "@/lib/types";

type RequestView = "inbox" | "approved" | "rejected" | "archive";
type RequestSort = "priority" | "newest" | "oldest";

const statusLabels: Record<EnquiryStatus, string> = {
  new: "New",
  reviewing: "In review",
  approved: "Approved",
  declined: "Rejected",
  archived: "Archived",
};

const statusPriority: Record<EnquiryStatus, number> = {
  new: 0,
  reviewing: 1,
  declined: 2,
  approved: 3,
  archived: 4,
};

const brisbaneDateFormatter = new Intl.DateTimeFormat("en-AU", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "Australia/Brisbane",
  year: "numeric",
});

const viewEmptyCopy: Record<RequestView, { title: string; description: string }> = {
  inbox: { title: "Inbox clear", description: "New enquiries and requests under review will appear here." },
  approved: { title: "No approved requests", description: "Approved enquiries will remain here as a record of their conversion into clients." },
  rejected: { title: "No rejected requests", description: "Requests you decide not to progress will appear here before you archive them." },
  archive: { title: "Archive empty", description: "Archived rejections are retained here and can be restored at any time." },
};

function calendarDayNumber(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

function requestAge(createdAt: string, today: string) {
  const createdParts = Object.fromEntries(
    brisbaneDateFormatter.formatToParts(new Date(createdAt)).map((part) => [part.type, part.value]),
  );
  const createdDate = `${createdParts.year}-${createdParts.month}-${createdParts.day}`;
  const days = Math.max(0, calendarDayNumber(today) - calendarDayNumber(createdDate));
  if (days === 0) return "Today";
  if (days === 1) return "1 day waiting";
  return `${days} days waiting`;
}

function RequestActions({ item }: { item: ClientEnquiry }) {
  const canDecide = item.status === "new" || item.status === "reviewing";

  return (
    <div className="request-actions">
      {item.status === "new" ? (
        <form action={markEnquiryReviewing}>
          <input type="hidden" name="id" value={item.id} />
          <SubmitButton className="request-action-button" pendingLabel="Starting…"><Clock3 size={14} /> Start review</SubmitButton>
        </form>
      ) : null}

      {canDecide ? (
        <ActionPopover
          action={approveEnquiry}
          summary={<><UserRoundCheck size={14} /> Approve</>}
          title="Approve and create client"
          summaryClassName="request-action-button request-action-approve"
          detailsClassName="action-popover request-action-popover"
        >
          <input type="hidden" name="id" value={item.id} />
          <p className="request-dialog-copy">This creates an active client with the contact details, selected package and project brief from this request.</p>
          <SubmitButton pendingLabel="Approving…"><Check size={14} /> Approve as client</SubmitButton>
        </ActionPopover>
      ) : null}

      {canDecide ? (
        <ActionPopover
          action={rejectEnquiry}
          summary={<><ShieldX size={14} /> Reject</>}
          title="Reject request"
          summaryClassName="request-action-button request-action-danger"
          detailsClassName="action-popover request-action-popover"
        >
          <input type="hidden" name="id" value={item.id} />
          <label>Reason <span>Kept inside the CRM</span><textarea name="rejection_reason" minLength={3} maxLength={1000} rows={5} placeholder="Why isn’t this request the right fit?" required /></label>
          <p className="request-dialog-copy">The request will move to Rejected, where it can be reconsidered or archived.</p>
          <SubmitButton className="admin-primary-button danger-button" pendingLabel="Rejecting…">Reject request</SubmitButton>
        </ActionPopover>
      ) : null}

      {item.status === "declined" ? (
        <>
          <form action={reopenEnquiry}>
            <input type="hidden" name="id" value={item.id} />
            <SubmitButton className="request-action-button" pendingLabel="Reopening…"><RotateCcw size={14} /> Reconsider</SubmitButton>
          </form>
          <form action={archiveRejectedEnquiry}>
            <input type="hidden" name="id" value={item.id} />
            <SubmitButton className="request-action-button request-action-danger" pendingLabel="Archiving…"><Archive size={14} /> Archive</SubmitButton>
          </form>
        </>
      ) : null}

      {item.status === "archived" ? (
        <form action={restoreArchivedEnquiry}>
          <input type="hidden" name="id" value={item.id} />
          <SubmitButton className="request-action-button" pendingLabel="Restoring…"><ArchiveRestore size={14} /> Restore rejection</SubmitButton>
        </form>
      ) : null}

      {item.status !== "archived" ? (
        <ActionPopover
          action={updateEnquiryNotes}
          summary={<><MessageSquareText size={14} /> {item.internal_notes ? "Edit notes" : "Add notes"}</>}
          title="Internal request notes"
          summaryClassName="request-action-button"
          detailsClassName="action-popover request-action-popover"
        >
          <input type="hidden" name="id" value={item.id} />
          <label>Notes <span>Only visible in the CRM</span><textarea name="internal_notes" maxLength={2000} rows={6} defaultValue={item.internal_notes ?? ""} placeholder="Call notes, fit assessment, follow-up context…" /></label>
          <SubmitButton pendingLabel="Saving…">Save notes</SubmitButton>
        </ActionPopover>
      ) : null}

      {item.status === "approved" ? <Link className="request-action-button request-action-approve" href="/admin/clients">View clients <ArrowUpRight size={14} /></Link> : null}
    </div>
  );
}

function RequestCard({ item, today }: { item: ClientEnquiry; today: string }) {
  const title = item.business_name || item.name;
  return (
    <article className={`request-card request-card-${item.status}`}>
      <div className="request-top">
        <span className={`status-pill status-${item.status}`}>{statusLabels[item.status]}</span>
        <time dateTime={item.created_at}>{formatDate(item.created_at)}</time>
      </div>

      <div className="request-card-heading">
        <div>
          <h2>{title}</h2>
          <p>{item.name}{item.package ? <> · <strong>{item.package.title}</strong></> : " · General enquiry"}</p>
        </div>
        {(item.status === "new" || item.status === "reviewing") ? <span className="request-age"><Clock3 size={13} /> {requestAge(item.created_at, today)}</span> : null}
      </div>

      <p className="request-message">{item.message || "No additional project note was supplied."}</p>

      {(item.preferred_timeline || item.budget_range || item.source_path !== "/") ? (
        <dl className="request-brief-details">
          {item.preferred_timeline ? <div><dt>Timeline</dt><dd>{item.preferred_timeline}</dd></div> : null}
          {item.budget_range ? <div><dt>Budget</dt><dd>{item.budget_range}</dd></div> : null}
          {item.source_path !== "/" ? <div><dt>Source</dt><dd>{item.source_path}</dd></div> : null}
        </dl>
      ) : null}

      {item.rejection_reason ? <div className="request-decision-note"><ShieldX size={15} /><div><span>Rejection reason</span><p>{item.rejection_reason}</p></div></div> : null}
      {item.internal_notes ? <div className="request-internal-note"><MessageSquareText size={15} /><div><span>Internal notes</span><p>{item.internal_notes}</p></div></div> : null}
      {item.converted_client ? <div className="request-conversion-note"><UserRoundCheck size={15} /><span>Converted to <strong>{item.converted_client.name}</strong>{item.reviewed_at ? ` on ${formatDate(item.reviewed_at)}` : ""}</span></div> : null}

      <div className="request-links">
        <a href={`mailto:${item.email}`}><Mail size={14} /> {item.email}</a>
        {item.phone ? <a href={`tel:${item.phone}`}><Phone size={14} /> {item.phone}</a> : null}
      </div>

      <RequestActions item={item} />
    </article>
  );
}

export function ClientRequestManager({ enquiries, today }: { enquiries: ClientEnquiry[]; today: string }) {
  const [view, setView] = useState<RequestView>("inbox");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<RequestSort>("priority");

  const counts = useMemo(() => ({
    inbox: enquiries.filter((item) => item.status === "new" || item.status === "reviewing").length,
    new: enquiries.filter((item) => item.status === "new").length,
    reviewing: enquiries.filter((item) => item.status === "reviewing").length,
    approved: enquiries.filter((item) => item.status === "approved").length,
    rejected: enquiries.filter((item) => item.status === "declined").length,
    archive: enquiries.filter((item) => item.status === "archived").length,
  }), [enquiries]);

  const visible = useMemo(() => {
    const normalisedQuery = query.trim().toLowerCase();
    const statusFiltered = enquiries.filter((item) => {
      if (view === "inbox") return item.status === "new" || item.status === "reviewing";
      if (view === "approved") return item.status === "approved";
      if (view === "rejected") return item.status === "declined";
      return item.status === "archived";
    });
    const searched = normalisedQuery
      ? statusFiltered.filter((item) => [item.name, item.business_name, item.email, item.phone, item.message, item.package?.title]
        .some((value) => value?.toLowerCase().includes(normalisedQuery)))
      : statusFiltered;
    return searched.toSorted((left, right) => {
      if (sort === "oldest") return left.created_at.localeCompare(right.created_at);
      if (sort === "newest") return right.created_at.localeCompare(left.created_at);
      return statusPriority[left.status] - statusPriority[right.status] || left.created_at.localeCompare(right.created_at);
    });
  }, [enquiries, query, sort, view]);

  const tabs: { id: RequestView; label: string; count: number }[] = [
    { id: "inbox", label: "Inbox", count: counts.inbox },
    { id: "approved", label: "Approved", count: counts.approved },
    { id: "rejected", label: "Rejected", count: counts.rejected },
    { id: "archive", label: "Archive", count: counts.archive },
  ];

  return (
    <>
      <section className="request-kpis" aria-label="Client request overview">
        <article className={counts.inbox ? "has-attention" : ""}><Inbox size={17} /><div><strong>{counts.inbox}</strong><span>Awaiting decision</span></div></article>
        <article><Clock3 size={17} /><div><strong>{counts.reviewing}</strong><span>In review</span></div></article>
        <article><UserRoundCheck size={17} /><div><strong>{counts.approved}</strong><span>Approved</span></div></article>
        <article><ShieldX size={17} /><div><strong>{counts.rejected}</strong><span>Rejected</span></div></article>
      </section>

      <section className="request-workspace">
        <div className="request-toolbar">
          <div className="request-tabs" role="tablist" aria-label="Request views">
            {tabs.map((tab) => <button type="button" role="tab" aria-selected={view === tab.id} className={view === tab.id ? "is-active" : ""} onClick={() => setView(tab.id)} key={tab.id}>{tab.label}<span>{tab.count}</span></button>)}
          </div>
          <div className="request-controls">
            <label className="request-search"><Search size={15} /><span className="sr-only">Search requests</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search requests" /></label>
            <select value={sort} onChange={(event) => setSort(event.target.value as RequestSort)} aria-label="Sort requests">
              <option value="priority">Priority first</option>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
          </div>
        </div>

        {visible.length ? <div className="request-grid">{visible.map((item) => <RequestCard item={item} today={today} key={item.id} />)}</div> : (
          <div className="admin-card request-empty"><EmptyState title={query ? "No matching requests" : viewEmptyCopy[view].title} description={query ? "Try a different name, business, email or package." : viewEmptyCopy[view].description} /></div>
        )}
      </section>
    </>
  );
}
