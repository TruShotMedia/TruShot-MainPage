import { Check, Mail, Phone } from "lucide-react";
import { approveEnquiry } from "@/app/admin/actions";
import { EmptyState } from "@/components/admin/empty-state";
import { PageHeader } from "@/components/admin/page-header";
import { getEnquiries } from "@/lib/data/admin";
import { formatDate } from "@/lib/format";

export default async function RequestsPage() {
  const enquiries = await getEnquiries();
  return (
    <>
      <PageHeader eyebrow="New business" title="Client requests" description="Review website enquiries, understand the brief, then approve the right fit into your client list." />
      {enquiries.length ? <div className="request-grid">
        {enquiries.map((item: Record<string, unknown>) => {
          const pkg = item.package as { title?: string } | null;
          return <article className="request-card" key={item.id as string}>
            <div className="request-top"><span className={`status-pill status-${item.status}`}>{String(item.status)}</span><time>{formatDate(item.created_at as string)}</time></div>
            <h2>{String(item.business_name || item.name)}</h2>
            <p className="request-contact">{String(item.name)} {pkg?.title && <>· <strong>{pkg.title}</strong></>}</p>
            <p className="request-message">{String(item.message || "No additional project note was supplied.")}</p>
            <div className="request-links"><a href={`mailto:${item.email}`}><Mail size={14} /> {String(item.email)}</a>{Boolean(item.phone) && <a href={`tel:${item.phone}`}><Phone size={14} /> {String(item.phone)}</a>}</div>
            {item.status === "new" && <form action={approveEnquiry}><input type="hidden" name="id" value={item.id as string} /><button className="admin-primary-button" type="submit"><Check size={16} /> Approve as client</button></form>}
          </article>;
        })}
      </div> : <EmptyState title="Inbox clear" description="New enquiries from the public website will arrive here automatically." />}
    </>
  );
}
