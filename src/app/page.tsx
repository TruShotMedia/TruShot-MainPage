import Image from "next/image";
import Link from "next/link";
import { ArrowDown, ArrowUpRight, Check, Minus } from "lucide-react";
import { AnalyticsTracker } from "@/components/public/analytics-tracker";
import { EnquiryForm } from "@/components/public/enquiry-form";
import { PackageButton } from "@/components/public/package-button";
import { PublicHeader } from "@/components/public/public-header";
import { fallbackWebsiteElements, getPublishedPricing, getPublishedWebsiteElements } from "@/lib/data/public";
import { formatCurrency } from "@/lib/format";

export default async function HomePage() {
  const [packages, websiteElements] = await Promise.all([getPublishedPricing(), getPublishedWebsiteElements()]);
  const services = websiteElements.filter((element) => element.element_type === "service");
  const about = websiteElements.find((element) => element.element_key === "about-growth-partner")
    ?? fallbackWebsiteElements[3];
  const businessSchema = {
    "@context": "https://schema.org",
    "@type": "ProfessionalService",
    name: "TruShot Media",
    areaServed: "Brisbane, Queensland, Australia",
    email: "info@fearlessau.com",
    description: "A creative growth partner connecting strategy, content and campaigns for ambitious Brisbane businesses.",
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
          <p>A creative growth partner combining strategy, content and campaigns to build attention, trust and momentum.</p>
          <a className="circle-link" href="#work" aria-label="Explore TruShot Media" data-analytics-key="hero.explore"><ArrowDown /></a>
        </div>
      </section>

      <div className="ticker" aria-hidden="true">
        <div>GROWTH STRATEGY <span>✦</span> VIDEO PRODUCTION <span>✦</span> SOCIAL CONTENT <span>✦</span> CAMPAIGNS <span>✦</span> GROWTH STRATEGY <span>✦</span></div>
      </div>

      <section className="statement" id="work" data-section="work">
        <p className="section-label">What we do</p>
        <div>
          <h2>Content earns attention.<br /><span>Partnership builds momentum.</span></h2>
          <p>We connect strategy, production and optimisation—giving ambitious businesses a repeatable creative system built around growth.</p>
        </div>
      </section>

      <section className="service-grid" aria-label="Services">
        {services.map((service, index) => (
          <article className="service-card" key={service.id}>
            <div className="service-media">
              <div className="service-shape" aria-hidden="true"><span /></div>
              {service.media_kind === "video" && service.media_url && (
                <video autoPlay muted loop playsInline preload="metadata" aria-hidden="true">
                  <source src={service.media_url} />
                </video>
              )}
              <div className="service-media-shade" aria-hidden="true" />
              <div className="service-number">{String(index + 1).padStart(2, "0")}</div>
            </div>
            <div className="service-content">
              {service.eyebrow && <span className="service-eyebrow">{service.eyebrow}</span>}
              <h3>{service.title}</h3>
              <p>{service.body}</p>
            </div>
          </article>
        ))}
      </section>

      <section className="about-section" id="about" data-section="about">
        <div className="about-media">
          <Image
            src={about.media_kind === "image" && about.media_url ? about.media_url : "/brand/wallpaper.png"}
            alt={about.media_alt || "TruShot Media"}
            fill
            sizes="(max-width: 720px) 100vw, 47vw"
          />
        </div>
        <div className="about-copy">
          <p className="section-label light">{about.eyebrow || "About TruShot"}</p>
          <h2>{about.title}</h2>
          <p>{about.body}</p>
          <div className="about-stats">
            <div><strong>Strategy</strong><span>directs the work</span></div>
            <div><strong>Content</strong><span>built to compound</span></div>
            <div><strong>Growth</strong><span>measured and refined</span></div>
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
            ["03", "Learn", "We review the response, find the signal and sharpen what comes next."],
            ["04", "Grow", "Each cycle builds a stronger, more useful creative system for your business."],
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
