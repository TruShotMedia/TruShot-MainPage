import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

export function PublicHeader({
  showPricing = true,
  workHref = "#work",
  aboutHref = "#about",
  pricingHref = "#pricing",
  enquireHref = "#enquire",
}: {
  showPricing?: boolean;
  workHref?: string;
  aboutHref?: string;
  pricingHref?: string;
  enquireHref?: string;
}) {
  return (
    <header className="public-header">
      <Link href="/" className="public-logo" aria-label="TruShot Media home">
        <Image src="/brand/logo-green.png" alt="TruShot Media" width={220} height={82} priority />
      </Link>
      <nav aria-label="Primary navigation">
        <a href={workHref}>Work</a>
        <a href={aboutHref}>About</a>
        {showPricing && <a href={pricingHref}>Pricing</a>}
      </nav>
      <a className="header-cta" href={enquireHref} data-analytics-key="header.enquire">
        Become a partner <ArrowUpRight size={17} />
      </a>
    </header>
  );
}
