import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { SITE_URL } from "@/lib/config";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "TruShot Media | Video & Content Production Brisbane",
    template: "%s | TruShot Media",
  },
  description:
    "Bold, strategic video and social content for Brisbane businesses ready to be seen, remembered and chosen.",
  keywords: [
    "Brisbane videographer",
    "Brisbane content creation",
    "social media video production",
    "commercial videography Queensland",
    "TruShot Media",
  ],
  openGraph: {
    type: "website",
    locale: "en_AU",
    url: SITE_URL,
    siteName: "TruShot Media",
    title: "TruShot Media — Content that earns attention",
    description: "Strategy-led video, photography and social content made in Brisbane.",
    images: [{ url: "/brand/wallpaper.png", width: 1600, height: 1125 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "TruShot Media — Content that earns attention",
    description: "Strategy-led video, photography and social content made in Brisbane.",
    images: ["/brand/wallpaper.png"],
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
