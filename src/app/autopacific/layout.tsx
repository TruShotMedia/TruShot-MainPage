import type { Metadata, Viewport } from "next";
import { autopacificApplicationNames, autopacificBrowserIcons } from "@/lib/autopacific-browser-branding";

export const metadata: Metadata = {
  applicationName: "AutoPacific Production",
  title: { absolute: autopacificApplicationNames.production },
  manifest: "/autopacific/manifest.webmanifest",
  icons: autopacificBrowserIcons("production"),
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
