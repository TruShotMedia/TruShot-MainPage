import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowDown, ArrowUpRight } from "lucide-react";
import { AnalyticsTracker } from "@/components/public/analytics-tracker";
import { EnquiryForm } from "@/components/public/enquiry-form";
import { PricingSection } from "@/components/public/pricing-section";
import { PublicHeader } from "@/components/public/public-header";
import { getPublishedPricing } from "@/lib/data/public";

export const metadata: Metadata = {
  title: "Content & Video Packages",
  description: "Explore TruShot Media content, video production and creative growth packages for Brisbane businesses.",
  alternates: { canonical: "/pricing" },
  robots: { index: false, follow: false },
};

export default async function PricingPage() {
  const packages = await getPublishedPricing();
  return (
    <main className="public-site pricing-page">
      <AnalyticsTracker />
      <PublicHeader showPricing pricingHref="#pricing" workHref="/#work" aboutHref="/#about" enquireHref="#enquire" />

      <section className="pricing-direct-hero">
        <p className="section-label">A practical place to start</p>
        <h1>Creative packages<br />built for <em>momentum.</em></h1>
        <div><p>Clear starting points for strategy, content and campaigns. Choose the closest fit and we’ll shape the final scope around the outcome.</p><a className="circle-link" href="#pricing" aria-label="View pricing packages"><ArrowDown /></a></div>
      </section>

      <PricingSection packages={packages} />

      <section className="enquiry-section" id="enquire" data-section="enquiry">
        <div className="enquiry-intro">
          <p className="section-label light">Become a partner</p>
          <h2>Choose a starting point.<br />We’ll shape the rest.</h2>
          <p>Select a package or tell us what you’re building. A short brief is enough.</p>
        </div>
        <EnquiryForm packages={packages} showPackages />
      </section>

      <footer className="public-footer">
        <Image src="/brand/logo-white.png" alt="TruShot Media" width={280} height={104} />
        <div className="footer-links"><a href="mailto:info@fearlessau.com">info@fearlessau.com <ArrowUpRight size={15} /></a><Link href="/">Home</Link><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></div>
        <p>© {new Date().getFullYear()} TruShot Media · Brisbane, Australia</p>
      </footer>
    </main>
  );
}
