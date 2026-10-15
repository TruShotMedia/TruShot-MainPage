import type { Metadata, Viewport } from "next";
import { Fira_Sans } from "next/font/google";
import "./ingreign.css";

const firaSans = Fira_Sans({
  subsets: ["latin"],
  weight: ["500", "600", "900"],
  variable: "--font-ingreign",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "INGREIGN", template: "%s · INGREIGN" },
  description: "The private INGREIGN content calendar, caption library and event post generator.",
  applicationName: "INGREIGN",
  manifest: "/ingreign/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/ingreign/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/ingreign/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/ingreign/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: { capable: true, title: "INGREIGN", statusBarStyle: "black-translucent" },
  robots: { index: false, follow: false, noarchive: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#140b0d",
};

export default function IngreignRootLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${firaSans.variable} ingreign-root`}>{children}</div>;
}

