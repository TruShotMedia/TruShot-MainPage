import type { Metadata, Viewport } from "next";
import { metadata as autopacificMetadata } from "@/app/autopacific/layout";
import { autopacificApplicationNames, autopacificBrowserIcons } from "@/lib/autopacific-browser-branding";
import { viewport as autopacificViewport } from "@/app/autopacific/layout";
export const viewport: Viewport = { ...autopacificViewport, colorScheme: "light dark", themeColor: "#f4f6f8" };

export const metadata: Metadata = {
  ...autopacificMetadata,
  title: { absolute: autopacificApplicationNames.marketing },
  icons: autopacificBrowserIcons("marketing"),
  applicationName: "AutoPacific Marketing",
  description: "AutoPacific jobs, planning and production calendar.",
  manifest: "/marketing/manifest.webmanifest",
  appleWebApp: { capable: true, title: "APG Marketing", statusBarStyle: "default" },
  robots: { index: false, follow: false },
};
export default function MarketingLayout({ children }: { children: React.ReactNode }) { return children; }
