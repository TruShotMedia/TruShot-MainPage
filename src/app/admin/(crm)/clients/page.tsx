import { Archive, Copy, Pencil, Plus } from "lucide-react";
import { archiveClient, createClient, duplicateClient, updateClient } from "@/app/admin/actions";
import { ActionPopover } from "@/components/admin/action-popover";
import { EmptyState } from "@/components/admin/empty-state";
import { PageHeader } from "@/components/admin/page-header";
import { SubmitButton } from "@/components/admin/submit-button";
import { getClientPackageOptionsAdmin, getClients } from "@/lib/data/admin";
import { formatCurrency, initials } from "@/lib/format";

export default async function ClientsPage() {
  const [clients, packages] = await Promise.all([getClients(), getClientPackageOptionsAdmin()]);
  return (
    <>
      <PageHeader eyebrow="Relationships" title="Clients" description="The people and businesses behind every brief, job, invoice and ongoing partnership." actions={
        <ActionPopover action={createClient} summary={<><Plus size={16} /> New client</>} title="Add a client">
          <label>Name<input name="name" required /></label>
          <label>Email<input name="email" type="email" /></label>
          <label>Phone<input name="phone" /></label>
          <label>Industry<input name="industry" /></label>
          <label>Package<select name="package_id"><option value="">No package selected</option>{packages.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
          <SubmitButton pendingLabel="Creating…">Create client</SubmitButton>
        </ActionPopover>
      } />
      {clients.length ? <section className="client-grid">
        {clients.map((client: Record<string, unknown>) => {
          const contacts = (client.contacts ?? []) as Record<string, unknown>[];
          const primary = contacts.find((contact) => contact.is_primary) ?? contacts[0];
          const selectedPackage = client.package as Record<string, unknown> | null;
          const selectedPackageIsCurrent = packages.some((item) => item.id === client.package_id);
          return <article className="client-card" key={client.id as string}>
            <div className="client-avatar">{initials(client.name as string)}</div>
            <div className="client-title"><div><h2>{client.name as string}</h2><p>{String(client.industry || "Industry not set")}</p></div><span className={`status-pill status-${client.status}`}>{String(client.status)}</span></div>
            <dl><div><dt>Primary contact</dt><dd>{String(primary?.name || "—")}</dd></div><div><dt>Email</dt><dd>{String(primary?.email || "—")}</dd></div><div><dt>Package</dt><dd>{String(selectedPackage?.title || "Not selected")}</dd></div><div><dt>Total job value</dt><dd>{formatCurrency(Number(client.earned_cents ?? 0))}</dd></div><div><dt>Received</dt><dd>{formatCurrency(Number(client.paid_cents ?? 0))}</dd></div><div><dt>Monthly budget</dt><dd>{client.monthly_budget_cents ? formatCurrency(Number(client.monthly_budget_cents)) : "—"}</dd></div></dl>
            <div className="client-foot"><span className={`priority-dot priority-${client.priority}`} /> {String(client.priority)} priority {Boolean(client.is_retainer) && <b>Retainer</b>}</div>
            <ActionPopover
              action={updateClient}
              summary={<><Pencil size={14} /> Edit details</>}
              title={`Edit ${client.name as string}`}
              detailsClassName="inline-editor client-editor"
              summaryClassName=""
              formClassName="quick-form wide"
            >
                <input type="hidden" name="id" value={client.id as string} />
                <input type="hidden" name="contact_id" value={String(primary?.id ?? "")} />
                <label>Client name<input name="name" required defaultValue={client.name as string} /></label>
                <label>Status<select name="status" defaultValue={client.status as string}><option value="lead">Lead</option><option value="active">Active</option><option value="paused">Paused</option><option value="inactive">Inactive</option></select></label>
                <label>Industry<input name="industry" defaultValue={String(client.industry ?? "")} /></label>
                <label>Website<input name="website_url" type="url" defaultValue={String(client.website_url ?? "")} placeholder="https://" /></label>
                <label>Priority<select name="priority" defaultValue={client.priority as string}><option value="low">Low</option><option value="standard">Standard</option><option value="high">High</option><option value="vip">VIP</option></select></label>
                <label>Monthly budget AUD<input name="monthly_budget_dollars" type="number" min="0" step="0.01" defaultValue={client.monthly_budget_cents == null ? "" : Number(client.monthly_budget_cents) / 100} /></label>
                <label>Package<select name="package_id" defaultValue={String(client.package_id ?? "")}><option value="">No package selected</option>{selectedPackage && !selectedPackageIsCurrent && <option value={client.package_id as string}>{String(selectedPackage.title)} (previous)</option>}{packages.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
                <label>Contact name<input name="contact_name" defaultValue={String(primary?.name ?? "")} /></label>
                <label>Contact email<input name="contact_email" type="email" defaultValue={String(primary?.email ?? "")} /></label>
                <label>Contact phone<input name="contact_phone" defaultValue={String(primary?.phone ?? "")} /></label>
                <label className="checkbox-field"><input name="is_retainer" type="checkbox" defaultChecked={Boolean(client.is_retainer)} /><span>Retainer client</span></label>
                <label className="form-span">Notes<textarea name="notes" rows={3} defaultValue={String(client.notes ?? "")} /></label>
                <SubmitButton pendingLabel="Saving…">Save client</SubmitButton>
            </ActionPopover>
            <div className="record-actions">
              <form action={duplicateClient}><input type="hidden" name="id" value={client.id as string} /><SubmitButton className="record-action-button" pendingLabel="Duplicating…"><Copy size={13} /> Duplicate</SubmitButton></form>
              <form action={archiveClient}><input type="hidden" name="id" value={client.id as string} /><SubmitButton className="record-action-button danger" pendingLabel="Removing…"><Archive size={13} /> Remove</SubmitButton></form>
            </div>
          </article>;
        })}
      </section> : <EmptyState title="Your client list is ready" description="Add a client manually or approve a website request to create the first record." />}
    </>
  );
}
