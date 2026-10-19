import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  applicationName: "AutoPacific Production",
  manifest: "/autopacific/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/autopacific/icons/192", sizes: "192x192", type: "image/png" },
      { url: "/autopacific/icons/512", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/autopacific/icons/180", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "AutoPacific",
    statusBarStyle: "black",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  colorScheme: "dark",
  themeColor: "#071017",
};

export default function AutopacificLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
