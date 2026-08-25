import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, LockKeyhole } from "lucide-react";
import { PortfolioGallery } from "@/components/public/portfolio-gallery";
import { PortfolioProtection } from "@/components/public/portfolio-protection";
import { getPublishedPortfolioCategories, getPublishedPortfolioMiscLogos } from "@/lib/data/public";
import type { PortfolioCategory, PortfolioMiscLogo } from "@/lib/types";

const MINIMUM_LOGO_TILES = 12;

function PortfolioLogoMarquee({ categories, miscLogos }: { categories: PortfolioCategory[]; miscLogos: PortfolioMiscLogo[] }) {
  const logos = [
    ...categories.filter((category) => category.logo_url).map((category) => ({ id: `category:${category.id}`, name: category.name, logoUrl: category.logo_url! })),
    ...miscLogos.map((logo) => ({ id: `misc:${logo.id}`, name: logo.name, logoUrl: logo.logo_url })),
  ];
  if (logos.length === 0) return null;

  const repetitions = Math.ceil(MINIMUM_LOGO_TILES / logos.length);
  const logoTiles = Array.from({ length: repetitions }, () => logos).flat();

  return (
    <section className="portfolio-logo-marquee" aria-label="Featured portfolio collaborators">
      <span className="sr-only">Featured collaborators: {logos.map((logo) => logo.name).join(", ")}</span>
      <div className="portfolio-logo-marquee-track" aria-hidden="true">
        {[0, 1].map((group) => (
          <div className="portfolio-logo-marquee-group" key={group}>
            {logoTiles.map((logo, index) => (
              <span className="portfolio-logo-marquee-tile" key={`${group}-${logo.id}-${index}`}>
                <Image src={logo.logoUrl} alt="" fill sizes="(max-width: 700px) 130px, 210px" />
              </span>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

export const metadata: Metadata = {
  title: "Selected Work",
  description: "A private selection of video and photography work by TruShot Media.",
  alternates: { canonical: "/portfolio" },
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
};

export default async function PortfolioPage() {
  const [categories, miscLogos] = await Promise.all([
    getPublishedPortfolioCategories(),
    getPublishedPortfolioMiscLogos(),
  ]);
  const itemCount = categories.reduce((total, category) => total + category.items.length, 0);
  const firstVideoId = categories.flatMap((category) => category.items).find((item) => item.media_kind === "video")?.id;

  return (
    <main className="portfolio-page">
      <PortfolioProtection />
      <header className="portfolio-header">
        <Link href="/" className="portfolio-logo" aria-label="TruShot Media home">
          <Image src="/brand/logo-white.png" alt="TruShot Media" width={220} height={82} priority />
        </Link>
        <Link href="/#enquire" className="portfolio-header-cta">Become a partner <ArrowUpRight size={17} /></Link>
      </header>

      <section className="portfolio-hero">
        <div className="portfolio-hero-topline">
          <p><LockKeyhole size={14} /> Private link · Selected work</p>
          <span>{String(itemCount).padStart(2, "0")} pieces · {String(categories.length).padStart(2, "0")} collections</span>
        </div>
        <h1>Stories that<br /><em>move.</em></h1>
        <div className="portfolio-hero-copy">
          <p>A considered selection of moving image and photography made to earn attention, build trust and create momentum.</p>
          <span>TruShot Media · Brisbane, Australia</span>
        </div>
      </section>

      <section className="portfolio-collection">
        <PortfolioLogoMarquee categories={categories} miscLogos={miscLogos} />

        {categories.length > 0 ? (
          <>
            <nav className="portfolio-category-nav" aria-label="Portfolio collections">
              {categories.map((category) => <a href={`#${category.slug}`} key={category.id}>{category.name}<span>{category.items.length}</span></a>)}
            </nav>
            <div className="portfolio-category-list">
              {categories.map((category, categoryIndex) => (
                <section className="portfolio-category-section" id={category.slug} key={category.id}>
                  <header className="portfolio-category-heading">
                    <div><span>Collection {String(categoryIndex + 1).padStart(2, "0")}</span><h2>{category.name}</h2></div>
                    <div><p>{category.description || "A focused selection of motion and stills from this body of work."}</p><small>{category.items.length} {category.items.length === 1 ? "piece" : "pieces"}</small></div>
                  </header>
                  <PortfolioGallery items={category.items} firstVideoId={firstVideoId} priorityFirst={categoryIndex === 0} />
                </section>
              ))}
            </div>
          </>
        ) : (
          <div className="portfolio-public-empty">
            <p>Selected work is being curated.</p>
            <span>This private collection will be ready to view shortly.</span>
          </div>
        )}
      </section>

      <section className="portfolio-outro">
        <p className="section-label light">Your next chapter</p>
        <h2>Let’s make work<br />worth <em>watching.</em></h2>
        <Link href="/#enquire">Become a partner <ArrowUpRight size={20} /></Link>
      </section>

      <footer className="portfolio-footer">
        <Image src="/brand/logo-white.png" alt="TruShot Media" width={230} height={84} />
        <Link href="/"><ArrowLeft size={15} /> Return to trushotmedia.com</Link>
        <p>Private presentation link · Please do not distribute without permission.</p>
      </footer>
    </main>
  );
}
