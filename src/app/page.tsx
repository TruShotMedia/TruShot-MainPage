import Image from "next/image";
import Link from "next/link";
import { ArrowDown, ArrowUpRight, Check, Minus } from "lucide-react";
import { AnalyticsTracker } from "@/components/public/analytics-tracker";
import { EnquiryForm } from "@/components/public/enquiry-form";
import { PackageButton } from "@/components/public/package-button";
import { PublicHeader } from "@/components/public/public-header";
import { getPublishedPricing } from "@/lib/data/public";
import { formatCurrency } from "@/lib/format";

const services = [
  ["01", "Social content", "Short-form video and stills designed to earn attention in the feed."],
  ["02", "Brand stories", "Films that make the people, thinking and value behind your business tangible."],
  ["03", "Campaigns", "A connected content system built around a goal, not a pile of disconnected assets."],
];

export default async function HomePage() {
  const packages = await getPublishedPricing();
  const businessSchema = {
    "@context": "https://schema.org",
    "@type": "ProfessionalService",
    name: "TruShot Media",
    areaServed: "Brisbane, Queensland, Australia",
    email: "info@fearlessau.com",
    description: "Strategy-led video, photography and social content production.",
  };

  return (
    <main className="public-site">
      <AnalyticsTracker />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(businessSchema) }} />
      <PublicHeader />

      <section className="hero" data-section="hero">
        <div className="hero-kicker"><span /> Brisbane · Queensland · Australia</div>
        <h1>Make work<br />worth <em>watching.</em></h1>
        <div className="hero-bottom">
          <p>Strategy-led video and social content for brands that want more than “just post something.”</p>
          <a className="circle-link" href="#work" aria-label="Explore TruShot Media" data-analytics-key="hero.explore"><ArrowDown /></a>
        </div>
      </section>

      <div className="ticker" aria-hidden="true">
        <div>VIDEO PRODUCTION <span>✦</span> SOCIAL CONTENT <span>✦</span> PHOTOGRAPHY <span>✦</span> STRATEGY <span>✦</span> VIDEO PRODUCTION <span>✦</span></div>
      </div>

      <section className="statement" id="work" data-section="work">
        <p className="section-label">What we do</p>
        <div>
          <h2>Good content gets seen.<br /><span>Great content gets felt.</span></h2>
          <p>We turn clear thinking into sharp creative — so your audience understands who you are, why you matter, and what to do next.</p>
        </div>
      </section>

      <section className="service-grid" aria-label="Services">
        {services.map(([number, title, copy]) => (
          <article className="service-card" key={number}>
            <div className="service-number">{number}</div>
            <div className="service-shape" aria-hidden="true"><span /></div>
            <h3>{title}</h3>
            <p>{copy}</p>
          </article>
        ))}
      </section>

      <section className="about-section" id="about" data-section="about">
        <div className="about-mark">TS<span>✦</span></div>
        <div className="about-copy">
          <p className="section-label light">About TruShot</p>
          <h2>Small team.<br />Serious intent.</h2>
          <p>TruShot Media is a Brisbane content studio built for businesses that care about the standard of their work. We keep the process direct, collaborative and useful — from the first idea to the final export.</p>
          <div className="about-stats">
            <div><strong>Strategy</strong><span>before cameras</span></div>
            <div><strong>Craft</strong><span>without the theatre</span></div>
            <div><strong>Clarity</strong><span>at every handover</span></div>
          </div>
        </div>
      </section>

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

      <section className="process-section" data-section="process">
        <p className="section-label light">The process</p>
        <h2>Simple on purpose.</h2>
        <div className="process-grid">
          {[
            ["01", "Align", "We get clear on the audience, message and useful outcome."],
            ["02", "Create", "We plan, shoot and build the right set of assets."],
            ["03", "Refine", "You review through a tidy feedback loop, without chaos."],
            ["04", "Deliver", "Final assets arrive organised, ready to publish and reuse."],
          ].map(([number, title, copy]) => (
            <article key={number}><span>{number}</span><h3>{title}</h3><p>{copy}</p></article>
          ))}
        </div>
      </section>

      <section className="enquiry-section" id="enquire" data-section="enquiry">
        <div className="enquiry-intro">
          <p className="section-label light">Start a project</p>
          <h2>Tell us what<br />you’re building.</h2>
          <p>A short brief is enough. We’ll help shape the rest.</p>
        </div>
        <EnquiryForm packages={packages} />
      </section>

      <footer className="public-footer">
        <Image src="/brand/logo-white.png" alt="TruShot Media" width={280} height={104} />
        <div className="footer-links">
          <a href="mailto:info@fearlessau.com">info@fearlessau.com <ArrowUpRight size={15} /></a>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/admin">Admin</Link>
        </div>
        <p>© {new Date().getFullYear()} TruShot Media · Brisbane, Australia</p>
      </footer>
    </main>
  );
}
