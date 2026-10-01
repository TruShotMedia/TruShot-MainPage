import type { Metadata } from "next";
import { PortfolioKioskPlayer } from "@/components/public/portfolio-kiosk-player";
import { PortfolioProtection } from "@/components/public/portfolio-protection";
import { getPublishedPortfolioCategories } from "@/lib/data/public";
import { getLandscapePortfolioVideos } from "@/lib/portfolio";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Portfolio Kiosk",
  description: "A full-screen landscape film presentation by TruShot Media.",
  alternates: { canonical: "/portfolio/kiosk" },
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
};

export default async function PortfolioKioskPage() {
  const categories = await getPublishedPortfolioCategories();
  const videos = getLandscapePortfolioVideos(categories);

  return (
    <>
      <PortfolioProtection />
      <PortfolioKioskPlayer items={videos} />
    </>
  );
}
