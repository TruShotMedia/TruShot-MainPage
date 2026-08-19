import { Check, Minus } from "lucide-react";
import { updatePricingPackage } from "@/app/admin/actions";
import { ActionPopover } from "@/components/admin/action-popover";
import { PageHeader } from "@/components/admin/page-header";
import { SubmitButton } from "@/components/admin/submit-button";
import { getPricingAdmin } from "@/lib/data/admin";
import { formatCurrency } from "@/lib/format";

export default async function PricingPage() {
  const packages = await getPricingAdmin();
  return (
    <>
      <PageHeader eyebrow="Website offer" title="Pricing" description="These published package titles, prices and summaries feed the public website. Edit once; the live offer stays consistent." />
      <div className="pricing-admin-grid">
        {packages.map((item: Record<string, unknown>) => <article className={`pricing-admin-card ${item.is_featured ? "featured-admin" : ""}`} key={item.id as string}>
          <div className="pricing-admin-head"><div><span>{String(item.eyebrow ?? "Package")}</span><h2>{item.title as string}</h2></div><strong>{formatCurrency(Number(item.price_cents))}</strong></div>
          <ul>{((item.items ?? []) as Record<string, unknown>[]).map((entry) => <li key={entry.id as string}>{entry.kind === "exclusion" ? <Minus size={14} /> : <Check size={14} />}{entry.label as string}</li>)}</ul>
          <ActionPopover action={updatePricingPackage} summary="Edit package" title={`Edit ${item.title as string}`} detailsClassName="inline-editor" summaryClassName="">
            <input type="hidden" name="id" value={item.id as string} />
            <label>Title<input name="title" defaultValue={item.title as string} required /></label>
            <label>Summary<textarea name="summary" defaultValue={item.summary as string} rows={4} required /></label>
            <label>Price AUD<input name="price_dollars" type="number" min="0" step="0.01" defaultValue={Number(item.price_cents) / 100} /></label>
            <label>Price suffix<input name="price_suffix" defaultValue={String(item.price_suffix ?? "")} /></label>
            <SubmitButton pendingLabel="Saving…">Save & update website</SubmitButton>
          </ActionPopover>
        </article>)}
      </div>
      <div className="formula-note"><p><strong>Safe publishing model:</strong> new price structures should be created as a draft version, previewed, then published. Historical jobs keep their captured package snapshot, so website edits never rewrite past commercial terms.</p></div>
    </>
  );
}
