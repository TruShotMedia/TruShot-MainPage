import type { Metadata, Viewport } from "next";
import { AutopacificWorkspace } from "@/components/autopacific/autopacific-workspace";
import "./autopacific-mobile.css";

export const metadata: Metadata = {
  title: "AutoPacific Mobile",
  description: "AutoPacific Group jobs, tasks, calendar and daily itinerary for mobile.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  colorScheme: "dark",
  themeColor: "#061017",
};

export default function AutopacificMobilePage() {
  return <AutopacificWorkspace experience="mobile" />;
}
