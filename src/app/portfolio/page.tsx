import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, LockKeyhole } from "lucide-react";
import { PortfolioVideo } from "@/components/public/portfolio-video";
import { getPublishedPortfolioCategories } from "@/lib/data/public";

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
  const categories = await getPublishedPortfolioCategories();
  const itemCount = categories.reduce((total, category) => total + category.items.length, 0);

  return (
    <main className="portfolio-page">
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
        <div className="portfolio-collection-heading">
          <p className="section-label">Selected work</p>
          <p>Motion leads. Stills hold the detail. Together, each frame is part of a bigger growth story.</p>
        </div>

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
                  <div className="portfolio-gallery">
                    {category.items.map((item, index) => (
                      <article
                        className={`portfolio-tile portfolio-tile-${item.display_size} ${index === 0 ? "portfolio-tile-featured" : ""}`}
                        key={item.id}
                      >
                        <div className="portfolio-media">
                          {item.media_kind === "video" ? (
                            <PortfolioVideo src={item.public_url} label={item.alt_text} />
                          ) : (
                            <Image
                              src={item.public_url}
                              alt={item.alt_text}
                              fill
                              priority={categoryIndex === 0 && index === 0}
                              sizes={index === 0 || item.display_size === "wide" ? "(max-width: 720px) 100vw, 66vw" : "(max-width: 720px) 100vw, 34vw"}
                            />
                          )}
                          <div className="portfolio-media-shade" />
                          <span className="portfolio-kind">{item.media_kind === "video" ? "Motion" : "Still"}</span>
                        </div>
                      </article>
                    ))}
                  </div>
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
