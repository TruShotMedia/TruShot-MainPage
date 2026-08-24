import { Check, Minus } from "lucide-react";
import { PackageButton } from "@/components/public/package-button";
import { formatCurrency } from "@/lib/format";
import type { PricingPackage } from "@/lib/types";

export function PricingSection({ packages }: { packages: PricingPackage[] }) {
  return (
    <section className="pricing-section" id="pricing" data-section="pricing">
      <div className="pricing-heading">
        <div>
          <p className="section-label">Pricing</p>
          <h2>Choose your<br /><span>level of momentum.</span></h2>
        </div>
        <p>Start with one focused asset or build a consistent creative engine. Every package can be shaped around the outcome.</p>
      </div>
      <div className="pricing-grid">
        {packages.map((item, index) => (
          <article className={`pricing-card ${item.is_featured ? "featured" : ""}`} key={item.id}>
            <div className="package-topline"><span>0{index + 1}</span>{item.badge && <b>{item.badge}</b>}</div>
            <p className="package-eyebrow">{item.eyebrow}</p>
            <h3>{item.title}</h3>
            <div className="package-price"><strong>{formatCurrency(item.price_cents)}</strong><span>{item.price_suffix}</span></div>
            <p className="package-summary">{item.summary}</p>
            <ul>
              {item.items.map((entry) => (
                <li key={entry.id}>{entry.kind === "exclusion" ? <Minus size={15} /> : <Check size={15} />} {entry.label}</li>
              ))}
            </ul>
            <PackageButton slug={item.slug} label={item.cta_label} />
          </article>
        ))}
      </div>
    </section>
  );
}
