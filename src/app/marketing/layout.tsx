import type { Metadata } from "next";
import { metadata as autopacificMetadata } from "@/app/autopacific/layout";
export { viewport } from "@/app/autopacific/layout";

export const metadata: Metadata = {
  ...autopacificMetadata,
  title: "AutoPacific Marketing",
  applicationName: "AutoPacific Marketing",
  description: "AutoPacific jobs, planning and production calendar.",
  manifest: "/marketing/manifest.webmanifest",
  appleWebApp: { capable: true, title: "APG Marketing", statusBarStyle: "black" },
  robots: { index: false, follow: false },
};
export default function MarketingLayout({ children }: { children: React.ReactNode }) { return children; }
