"use client";

import { useMemo, useRef, useState, useTransition, type ChangeEvent, type CSSProperties, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import {
  Archive,
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  File,
  FilePlus2,
  FolderKanban,
  LoaderCircle,
  Mail,
  MapPin,
  Paperclip,
  Pause,
  Pencil,
  Phone,
  Plus,
  Search,
  Sparkles,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import {
  archiveCampaign,
  archiveCampaignAsset,
  createCampaignAsset,
  deleteCampaignAttachment,
  saveCampaignAttachment,
  setCampaignAssetStatus,
  updateCampaign,
  updateCampaignAsset,
} from "@/app/admin/campaign-actions";
import { ActionPopover } from "@/components/admin/action-popover";
import { SubmitButton } from "@/components/admin/submit-button";
import { uploadSupabaseFileResumable } from "@/lib/resumable-upload";
import type { Campaign, CampaignAsset, InvoiceOption, TaskStatus } from "@/lib/types";

const CAMPAIGN_ATTACHMENT_BUCKET = "website-campaign-attachments";
const CAMPAIGN_ATTACHMENT_LIMIT = 100 * 1024 * 1024;
const CAMPAIGN_ATTACHMENT_ACCEPT = [
  "image/jpeg", "image/png", "image/webp", "image/avif", "image/heic",
  "video/mp4", "video/webm", "video/quicktime",
  "application/pdf", ".doc", ".docx", ".xls", ".xlsx", ".txt", ".csv",
].join(",");
const attachmentMimeByExtension: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", avif: "image/avif", heic: "image/heic",
  mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime",
  pdf: "application/pdf", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  txt: "text/plain", csv: "text/csv",
};

const campaignStatusMeta = {
  planning: { label: "Planning", icon: Sparkles },
  active: { label: "Active", icon: ArrowRight },
  paused: { label: "Paused", icon: Pause },
  complete: { label: "Complete", icon: CheckCircle2 },
} as const;

type CampaignContact = {
  id: string;
  client_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  is_primary: boolean;
};

type CampaignManagerProps = {
  campaigns: Campaign[];
  clients: Array<{ id: string; name: string }>;
  contacts: CampaignContact[];
  statuses: TaskStatus[];
  invoices: InvoiceOption[];
  workspaceId: string;
};

function formatDate(date: string | null, fallback = "Not scheduled") {
  return date ? format(parseISO(date), "d MMM yyyy") : fallback;
}

function dateWindow(startDate: string | null, dueDate: string | null) {
  if (startDate && dueDate) return `${formatDate(startDate)} → ${formatDate(dueDate)}`;
  if (dueDate) return `Due ${formatDate(dueDate)}`;
  if (startDate) return `Starts ${formatDate(startDate)}`;
  return "Schedule not set";
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(cents / 100);
}

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function safeFileName(fileName: string) {
  const normalized = fileName.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-");
  return normalized.slice(-180) || "attachment";
}

function attachmentMimeType(file: File) {
  if (file.type) return file.type;
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return attachmentMimeByExtension[extension] ?? "";
}

function assetSort(left: CampaignAsset, right: CampaignAsset) {
  const leftDate = left.due_date ?? left.start_date ?? "9999-12-31";
  const rightDate = right.due_date ?? right.start_date ?? "9999-12-31";
  return leftDate.localeCompare(rightDate)
    || (left.start_date ?? "9999-12-31").localeCompare(right.start_date ?? "9999-12-31")
    || left.position - right.position
    || left.title.localeCompare(right.title);
}

function CampaignFields({ campaign, clients }: { campaign?: Campaign; clients: CampaignManagerProps["clients"] }) {
  return (
    <>
      {campaign ? <input type="hidden" name="id" value={campaign.id} /> : null}
      <label>Campaign name<input name="title" defaultValue={campaign?.title ?? ""} placeholder="Spring growth campaign" required /></label>
      <label>Client<select name="client_id" defaultValue={campaign?.client_id ?? ""}><option value="">No client yet</option>{clients.map((client) => <option value={client.id} key={client.id}>{client.name}</option>)}</select></label>
      <label>Status<select name="status" defaultValue={campaign?.status ?? "planning"}><option value="planning">Planning</option><option value="active">Active</option><option value="paused">Paused</option><option value="complete">Complete</option></select></label>
      <label>Start date<input type="date" name="start_date" defaultValue={campaign?.start_date ?? ""} /></label>
      <label>Campaign deadline<input type="date" name="due_date" defaultValue={campaign?.due_date ?? ""} /></label>
      <label className="form-span">Objective<textarea name="objective" rows={3} defaultValue={campaign?.objective ?? ""} placeholder="What should this campaign achieve?" /></label>
      <label className="form-span">Internal notes<textarea name="notes" rows={3} defaultValue={campaign?.notes ?? ""} placeholder="Strategy, approvals, dependencies or context." /></label>
    </>
  );
}

function AssetFields({
  campaign,
  asset,
  statuses,
  invoices,
  contacts,
}: {
  campaign: Campaign;
  asset?: CampaignAsset;
  statuses: TaskStatus[];
  invoices: InvoiceOption[];
  contacts: CampaignContact[];
}) {
  const campaignContacts = contacts.filter((contact) => contact.client_id === campaign.client_id);
  const invoiceOptions = [...invoices].sort((left, right) => {
    const leftMatches = left.client_id && left.client_id === campaign.client_id ? 0 : 1;
    const rightMatches = right.client_id && right.client_id === campaign.client_id ? 0 : 1;
    return leftMatches - rightMatches || right.issue_date.localeCompare(left.issue_date);
  });
  return (
    <>
      <input type="hidden" name="campaign_id" value={campaign.id} />
      {asset ? <input type="hidden" name="id" value={asset.id} /> : null}
      <label className="form-span">Asset / deliverable<input name="title" defaultValue={asset?.title ?? ""} placeholder="Launch film · 60 sec master" required /></label>
      <label>Type<input name="asset_type" defaultValue={asset?.asset_type ?? ""} placeholder="Video, carousel, stills…" /></label>
      <label>Status<select name="status_id" defaultValue={asset?.status_id ?? statuses[0]?.id} required>{statuses.map((status) => <option value={status.id} key={status.id}>{status.label}</option>)}</select></label>
      <label>Priority<select name="priority" defaultValue={asset?.priority ?? "normal"}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
      <label>Invoice (optional)<select name="invoice_id" defaultValue={asset?.invoice_id ?? ""}><option value="">Not linked</option>{invoiceOptions.map((invoice) => <option value={invoice.id} key={invoice.id}>{invoice.invoice_number} · {invoice.client_name ?? "No client"} · {formatMoney(invoice.total_cents)}</option>)}</select></label>
      <label>Start date<input type="date" name="start_date" defaultValue={asset?.start_date ?? ""} /></label>
      <label>Deadline<input type="date" name="due_date" defaultValue={asset?.due_date ?? ""} /></label>
      <label className="form-span">Description<textarea name="description" rows={3} defaultValue={asset?.description ?? ""} placeholder="What needs to be created and why it matters." /></label>
      <label className="form-span">Location<input name="location" defaultValue={asset?.location ?? ""} placeholder="Studio, venue, suburb or call link" /></label>
      <label>Best contact<input name="contact_name" list={`campaign-contacts-${campaign.id}`} defaultValue={asset?.contact_name ?? ""} placeholder="Contact name" /><datalist id={`campaign-contacts-${campaign.id}`}>{campaignContacts.map((contact) => <option value={contact.name} key={contact.id}>{[contact.email, contact.phone].filter(Boolean).join(" · ")}</option>)}</datalist></label>
      <label>Contact email<input type="email" name="contact_email" defaultValue={asset?.contact_email ?? ""} placeholder="name@business.com" /></label>
      <label>Contact phone<input type="tel" name="contact_phone" defaultValue={asset?.contact_phone ?? ""} placeholder="0400 000 000" /></label>
      <label className="form-span">Production notes<textarea name="notes" rows={4} defaultValue={asset?.notes ?? ""} placeholder="Shot list, approvals, delivery notes or dependencies." /></label>
    </>
  );
}

function AttachmentPanel({ asset, workspaceId }: { asset: CampaignAsset; workspaceId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function uploadFiles(files: File[]) {
    if (!files.length) return;
    const invalid = files.find((file) => file.size <= 0 || file.size > CAMPAIGN_ATTACHMENT_LIMIT);
    if (invalid) {
      setMessage(`${invalid.name} must be smaller than 100 MB.`);
      return;
    }
    const unsupported = files.find((file) => !attachmentMimeType(file));
    if (unsupported) {
      setMessage(`${unsupported.name} is not a supported campaign attachment.`);
      return;
    }
    setUploading(true);
    setMessage("");
    try {
      for (const [index, file] of files.entries()) {
        const mimeType = attachmentMimeType(file);
        const storagePath = `${workspaceId}/campaigns/${asset.id}/${crypto.randomUUID()}/${safeFileName(file.name)}`;
        setMessage(`Uploading ${index + 1} of ${files.length} · 0% · ${file.name}`);
        await uploadSupabaseFileResumable({
          file,
          storagePath,
          bucketName: CAMPAIGN_ATTACHMENT_BUCKET,
          contentType: mimeType,
          cacheControl: "3600",
          onProgress: ({ percentage }) => setMessage(`Uploading ${index + 1} of ${files.length} · ${percentage}% · ${file.name}`),
        });
        try {
          await saveCampaignAttachment({ assetId: asset.id, storagePath, fileName: file.name, mimeType, fileSizeBytes: file.size });
        } catch (error) {
          const { createClient } = await import("@/lib/supabase/client");
          await createClient().storage.from(CAMPAIGN_ATTACHMENT_BUCKET).remove([storagePath]);
          throw error;
        }
      }
      setMessage(`${files.length} ${files.length === 1 ? "attachment" : "attachments"} added.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The attachment could not be uploaded.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function removeAttachment(attachmentId: string) {
    setDeletingId(attachmentId);
    setMessage("");
    try {
      await deleteCampaignAttachment(attachmentId);
      setMessage("Attachment removed.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The attachment could not be removed.");
    } finally {
      setDeletingId(null);
    }
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    void uploadFiles(Array.from(event.dataTransfer.files));
  }

  return (
    <section className="campaign-attachments">
      <header><div><Paperclip size={15} /><strong>Attachments</strong></div><span>{asset.attachments.length}</span></header>
      {asset.attachments.length ? <div className="campaign-attachment-list">{asset.attachments.map((attachment) => (
        <article key={attachment.id}>
          <File size={15} />
          <div>{attachment.signed_url ? <a href={attachment.signed_url} target="_blank" rel="noreferrer">{attachment.file_name}</a> : <strong>{attachment.file_name}</strong>}<span>{formatBytes(attachment.file_size_bytes)}</span></div>
          <button type="button" onClick={() => void removeAttachment(attachment.id)} disabled={deletingId === attachment.id} aria-label={`Remove ${attachment.file_name}`}>{deletingId === attachment.id ? <LoaderCircle className="spin" size={14} /> : <X size={14} />}</button>
        </article>
      ))}</div> : null}
      <label
        className={`campaign-attachment-drop ${isDragging ? "is-dragging" : ""}`}
        onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <FilePlus2 size={17} />
        <span>{uploading ? "Uploading…" : "Drop files or choose attachments"}</span>
        <small>Images, video, PDF, Office, text or CSV · 100 MB each</small>
        <input ref={inputRef} type="file" accept={CAMPAIGN_ATTACHMENT_ACCEPT} multiple disabled={uploading} onChange={(event: ChangeEvent<HTMLInputElement>) => void uploadFiles(Array.from(event.target.files ?? []))} />
      </label>
      {message ? <p className="campaign-attachment-message" aria-live="polite">{message}</p> : null}
    </section>
  );
}

function CampaignAssetCard({
  asset,
  campaign,
  index,
  statuses,
  invoices,
  contacts,
  workspaceId,
}: {
  asset: CampaignAsset;
  campaign: Campaign;
  index: number;
  statuses: TaskStatus[];
  invoices: InvoiceOption[];
  contacts: CampaignContact[];
  workspaceId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const completedStatus = statuses.find((status) => status.key === "posted_done");
  const isComplete = asset.status ? !asset.status.is_open : Boolean(asset.completed_at);

  function changeStatus(statusId: string) {
    setMessage("");
    startTransition(async () => {
      try {
        await setCampaignAssetStatus(asset.id, statusId);
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "The status could not be changed.");
      }
    });
  }

  function removeAsset() {
    if (!window.confirm(`Remove “${asset.title}” from this campaign?`)) return;
    setMessage("");
    startTransition(async () => {
      try {
        await archiveCampaignAsset(asset.id);
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "The asset could not be removed.");
      }
    });
  }

  return (
    <article className={`campaign-asset-card ${isComplete ? "is-complete" : ""}`}>
      <div className="campaign-flow-node" style={{ "--asset-status-color": asset.status?.color ?? "#777d76" } as CSSProperties}>
        {isComplete ? <Check size={15} /> : String(index + 1).padStart(2, "0")}
      </div>
      <div className="campaign-asset-main">
        <header>
          <div className="campaign-asset-title">
            <div><span className={`campaign-priority priority-${asset.priority}`}>{asset.priority}</span>{asset.asset_type ? <span>{asset.asset_type}</span> : null}</div>
            <h3>{asset.title}</h3>
            {asset.description ? <p>{asset.description}</p> : null}
          </div>
          <div className="campaign-asset-actions">
            {completedStatus && !isComplete ? <button type="button" className="campaign-complete-button" onClick={() => changeStatus(completedStatus.id)} disabled={isPending} title="Mark complete"><Check size={16} /></button> : null}
            <ActionPopover action={updateCampaignAsset} summary={<Pencil size={15} />} title={`Edit ${asset.title}`} summaryClassName="campaign-icon-button" formClassName="quick-form wide campaign-asset-form">
              <AssetFields campaign={campaign} asset={asset} statuses={statuses} invoices={invoices} contacts={contacts} />
              <SubmitButton pendingLabel="Saving asset…">Save asset</SubmitButton>
            </ActionPopover>
            <button type="button" className="campaign-icon-button is-danger" onClick={removeAsset} disabled={isPending} aria-label={`Remove ${asset.title}`}><Trash2 size={15} /></button>
          </div>
        </header>

        <div className="campaign-asset-schedule">
          <span><CalendarDays size={15} /> {dateWindow(asset.start_date, asset.due_date)}</span>
          <label><i style={{ background: asset.status?.color ?? "#777d76" }} /><select value={asset.status_id} onChange={(event) => changeStatus(event.target.value)} disabled={isPending} aria-label={`Status for ${asset.title}`}>{statuses.map((status) => <option value={status.id} key={status.id}>{status.label}</option>)}</select></label>
        </div>

        <div className="campaign-asset-details">
          {asset.location ? <span><MapPin size={14} /> {asset.location}</span> : null}
          {asset.contact_name ? <span><UserRound size={14} /> {asset.contact_name}</span> : null}
          {asset.contact_email ? <a href={`mailto:${asset.contact_email}`}><Mail size={14} /> {asset.contact_email}</a> : null}
          {asset.contact_phone ? <a href={`tel:${asset.contact_phone}`}><Phone size={14} /> {asset.contact_phone}</a> : null}
          {asset.invoice ? <span><CircleDollarSign size={14} /> {asset.invoice.invoice_number} · {formatMoney(asset.invoice.total_cents)}</span> : null}
        </div>
        {asset.notes ? <p className="campaign-asset-notes">{asset.notes}</p> : null}
        <AttachmentPanel asset={asset} workspaceId={workspaceId} />
        {message ? <p className="campaign-action-message" role="alert">{message}</p> : null}
      </div>
    </article>
  );
}

export function CampaignManager({ campaigns, clients, contacts, statuses, invoices, workspaceId }: CampaignManagerProps) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(campaigns[0]?.id ?? null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | Campaign["status"]>("all");
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState("");

  const filteredCampaigns = useMemo(() => campaigns.filter((campaign) => {
    if (statusFilter !== "all" && campaign.status !== statusFilter) return false;
    const haystack = `${campaign.title} ${campaign.client?.name ?? ""} ${campaign.objective ?? ""}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  }), [campaigns, query, statusFilter]);
  const selectedCampaign = campaigns.find((campaign) => campaign.id === selectedId) ?? filteredCampaigns[0] ?? null;

  function removeCampaign() {
    if (!selectedCampaign || !window.confirm(`Remove “${selectedCampaign.title}” and hide all of its campaign assets?`)) return;
    setMessage("");
    startTransition(async () => {
      try {
        await archiveCampaign(selectedCampaign.id);
        setSelectedId(campaigns.find((campaign) => campaign.id !== selectedCampaign.id)?.id ?? null);
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "The campaign could not be removed.");
      }
    });
  }

  if (!campaigns.length) {
    return <section className="admin-card campaign-empty"><FolderKanban size={30} /><span>Campaign planning</span><h2>Build the first campaign story</h2><p>Create a campaign above, attach it to a client, then map every deliverable from idea to deadline.</p></section>;
  }

  return (
    <div className="campaign-workspace">
      <aside className="admin-card campaign-index">
        <header><div><span>Campaign library</span><h2>{campaigns.length} campaign{campaigns.length === 1 ? "" : "s"}</h2></div><FolderKanban size={18} /></header>
        <label className="campaign-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search campaigns" /></label>
        <div className="campaign-status-filters">{(["all", "planning", "active", "paused", "complete"] as const).map((status) => <button type="button" className={statusFilter === status ? "is-active" : ""} onClick={() => setStatusFilter(status)} key={status}>{status === "all" ? "All" : campaignStatusMeta[status].label}</button>)}</div>
        <div className="campaign-index-list">{filteredCampaigns.map((campaign) => {
          const complete = campaign.assets.filter((asset) => asset.status && !asset.status.is_open).length;
          const progress = campaign.assets.length ? Math.round((complete / campaign.assets.length) * 100) : 0;
          const StatusIcon = campaignStatusMeta[campaign.status].icon;
          return <button type="button" className={campaign.id === selectedCampaign?.id ? "is-active" : ""} onClick={() => setSelectedId(campaign.id)} key={campaign.id}>
            <div className="campaign-index-copy"><span><StatusIcon size={12} /> {campaignStatusMeta[campaign.status].label}</span><strong>{campaign.title}</strong><small>{campaign.client?.name ?? "No client"}</small></div>
            <div className="campaign-index-progress"><span style={{ width: `${progress}%` }} /><em>{progress}%</em></div>
            <ChevronRight size={15} />
          </button>;
        })}</div>
        {!filteredCampaigns.length ? <p className="campaign-no-results">No campaigns match this view.</p> : null}
      </aside>

      {selectedCampaign ? <main className="campaign-detail">
        <section className="admin-card campaign-hero">
          <div className="campaign-hero-copy">
            <div className="campaign-hero-eyebrow"><span className={`campaign-status campaign-status-${selectedCampaign.status}`}>{campaignStatusMeta[selectedCampaign.status].label}</span><span>{selectedCampaign.client?.name ?? "Independent campaign"}</span></div>
            <h1>{selectedCampaign.title}</h1>
            <p>{selectedCampaign.objective ?? "Add a clear campaign objective so every asset stays connected to the result."}</p>
            <div className="campaign-hero-meta"><span><CalendarDays size={15} /> {dateWindow(selectedCampaign.start_date, selectedCampaign.due_date)}</span><span><Clock3 size={15} /> Updated {formatDate(selectedCampaign.updated_at.slice(0, 10))}</span></div>
          </div>
          <div className="campaign-hero-actions">
            <ActionPopover action={updateCampaign} summary={<><Pencil size={15} /> Edit campaign</>} title={`Edit ${selectedCampaign.title}`} summaryClassName="admin-secondary-button" formClassName="quick-form wide">
              <CampaignFields campaign={selectedCampaign} clients={clients} />
              <SubmitButton pendingLabel="Saving campaign…">Save campaign</SubmitButton>
            </ActionPopover>
            <button type="button" className="campaign-remove-button" onClick={removeCampaign} disabled={isPending}><Archive size={15} /> Remove</button>
          </div>
        </section>

        <section className="campaign-progress-panel">
          <div className="campaign-progress-copy"><span>Campaign progress</span><strong>{selectedCampaign.assets.filter((asset) => asset.status && !asset.status.is_open).length} of {selectedCampaign.assets.length} assets complete</strong></div>
          <div className="campaign-progress-track"><span style={{ width: `${selectedCampaign.assets.length ? Math.round((selectedCampaign.assets.filter((asset) => asset.status && !asset.status.is_open).length / selectedCampaign.assets.length) * 100) : 0}%` }} /></div>
          <ActionPopover action={createCampaignAsset} summary={<><Plus size={15} /> Add campaign asset</>} title="Add a campaign asset" formClassName="quick-form wide campaign-asset-form">
            <AssetFields campaign={selectedCampaign} statuses={statuses} invoices={invoices} contacts={contacts} />
            <SubmitButton pendingLabel="Creating asset…">Create asset</SubmitButton>
          </ActionPopover>
        </section>

        {selectedCampaign.assets.length ? <section className="campaign-flow" aria-label={`Asset plan for ${selectedCampaign.title}`}>
          {[...selectedCampaign.assets].sort(assetSort).map((asset, index) => <CampaignAssetCard asset={asset} campaign={selectedCampaign} index={index} statuses={statuses} invoices={invoices} contacts={contacts} workspaceId={workspaceId} key={asset.id} />)}
        </section> : <section className="admin-card campaign-assets-empty"><div><Sparkles size={21} /></div><span>Blank canvas</span><h2>Map the campaign flow</h2><p>Add the first deliverable. Dates automatically determine the order, and every deadline will appear in the shared calendar.</p></section>}
        {selectedCampaign.notes ? <section className="admin-card campaign-notes"><span>Campaign notes</span><p>{selectedCampaign.notes}</p></section> : null}
        {message ? <p className="campaign-action-message" role="alert">{message}</p> : null}
      </main> : null}
    </div>
  );
}
