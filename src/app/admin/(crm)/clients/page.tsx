import { Plus } from "lucide-react";
import { createClient } from "@/app/admin/actions";
import { EmptyState } from "@/components/admin/empty-state";
import { PageHeader } from "@/components/admin/page-header";
import { getClients } from "@/lib/data/admin";
import { formatCurrency, initials } from "@/lib/format";

export default async function ClientsPage() {
  const clients = await getClients();
  return (
    <>
      <PageHeader eyebrow="Relationships" title="Clients" description="The people and businesses behind every brief, job, invoice and ongoing partnership." actions={
        <details className="action-popover"><summary className="admin-primary-button"><Plus size={16} /> New client</summary><form action={createClient} className="quick-form"><h3>Add a client</h3><label>Name<input name="name" required /></label><label>Email<input name="email" type="email" /></label><label>Phone<input name="phone" /></label><label>Industry<input name="industry" /></label><button className="admin-primary-button" type="submit">Create client</button></form></details>
      } />
      {clients.length ? <section className="client-grid">
        {clients.map((client: Record<string, unknown>) => {
          const contacts = (client.contacts ?? []) as Record<string, unknown>[];
          const primary = contacts.find((contact) => contact.is_primary) ?? contacts[0];
          return <article className="client-card" key={client.id as string}><div className="client-avatar">{initials(client.name as string)}</div><div className="client-title"><div><h2>{client.name as string}</h2><p>{String(client.industry || "Industry not set")}</p></div><span className={`status-pill status-${client.status}`}>{String(client.status)}</span></div><dl><div><dt>Primary contact</dt><dd>{String(primary?.name || "—")}</dd></div><div><dt>Email</dt><dd>{String(primary?.email || "—")}</dd></div><div><dt>Monthly budget</dt><dd>{client.monthly_budget_cents ? formatCurrency(Number(client.monthly_budget_cents)) : "—"}</dd></div></dl><div className="client-foot"><span className={`priority-dot priority-${client.priority}`} /> {String(client.priority)} priority {Boolean(client.is_retainer) && <b>Retainer</b>}</div></article>;
        })}
      </section> : <EmptyState title="Your client list is ready" description="Add a client manually or approve a website request to create the first record." />}
    </>
  );
}
