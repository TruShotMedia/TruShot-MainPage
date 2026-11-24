import type { Metadata, Viewport } from "next";
import { SiteTelemetry } from "@/components/shared/site-telemetry";
import { SITE_URL } from "@/lib/config";
import "./globals.css";
import "./workspace.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: "TruShot Media",
  title: {
    default: "TruShot Media | Creative Growth Partner Brisbane",
    template: "%s | TruShot Media",
  },
  description:
    "A Brisbane creative growth partner combining strategy, video, photography and campaigns to build attention, trust and momentum.",
  alternates: { canonical: "/" },
  // Opt into the legacy icon on pages that inherit the site branding. Keeping
  // it outside app/ lets independently branded pages replace it completely.
  icons: { icon: [{ url: "/favicon.ico", sizes: "48x48", type: "image/x-icon" }, { url: "/icon.svg", type: "image/svg+xml" }] },
  keywords: [
    "Brisbane videographer",
    "Brisbane content creation",
    "social media video production",
    "commercial videography Queensland",
    "creative growth partner Brisbane",
    "TruShot Media",
  ],
  openGraph: {
    type: "website",
    locale: "en_AU",
    url: SITE_URL,
    siteName: "TruShot Media",
    title: "TruShot Media — Creative that builds momentum",
    description: "Strategy, content and campaigns working together to grow ambitious Brisbane businesses.",
    images: [{ url: "/brand/wallpaper.png", width: 1600, height: 1125 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "TruShot Media — Creative that builds momentum",
    description: "Strategy, content and campaigns working together to grow ambitious Brisbane businesses.",
    images: ["/brand/wallpaper.png"],
  },
  appleWebApp: {
    capable: true,
    title: "TruShot CRM",
    statusBarStyle: "black-translucent",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1f5e41",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-AU">
      <body>
        {children}
        <SiteTelemetry />
      </body>
    </html>
  );
}
