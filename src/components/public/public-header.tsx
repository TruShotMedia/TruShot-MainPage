import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

export function PublicHeader() {
  return (
    <header className="public-header">
      <Link href="/" className="public-logo" aria-label="TruShot Media home">
        <Image src="/brand/logo-green.png" alt="TruShot Media" width={220} height={82} priority />
      </Link>
      <nav aria-label="Primary navigation">
        <a href="#work">Work</a>
        <a href="#about">About</a>
        <a href="#pricing">Pricing</a>
      </nav>
      <a className="header-cta" href="#enquire" data-analytics-key="header.enquire">
        Start a project <ArrowUpRight size={17} />
      </a>
    </header>
  );
}
