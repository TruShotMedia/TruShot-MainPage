import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { SITE_URL } from "@/lib/config";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: "TruShot Media",
  title: {
    default: "TruShot Media | Creative Growth Partner Brisbane",
    template: "%s | TruShot Media",
  },
  description:
    "A Brisbane creative growth partner combining strategy, video, photography and campaigns to build attention, trust and momentum.",
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
    title: "TruShot",
    statusBarStyle: "black-translucent",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1f5e41",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-AU">
      <body>
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
