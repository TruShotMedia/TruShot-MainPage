import type { Metadata, Viewport } from "next";
import "./lifestyle.css";

export const metadata: Metadata = {
  title: { default: "Lifestyle", template: "%s · Lifestyle" },
  description: "A private, conflict-aware strength and wellbeing planner.",
  applicationName: "Lifestyle",
  manifest: "/lifestyle/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/lifestyle/icons/192", sizes: "192x192", type: "image/png" },
      { url: "/lifestyle/icons/512", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/lifestyle/icons/180", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: { capable: true, title: "Lifestyle", statusBarStyle: "black-translucent" },
  robots: { index: false, follow: false, noarchive: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  colorScheme: "dark",
  themeColor: "#07130e",
};

export default function LifestyleLayout({ children }: { children: React.ReactNode }) {
  return <div className="lifestyle-root">{children}</div>;
}

