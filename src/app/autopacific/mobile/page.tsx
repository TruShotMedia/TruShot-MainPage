import type { Metadata, Viewport } from "next";
import { AutopacificWorkspace } from "@/components/autopacific/autopacific-workspace";
import "./autopacific-mobile.css";

export const metadata: Metadata = {
  title: { absolute: "AutoPacific Production" },
  description: "AutoPacific Group jobs, tasks, calendar and daily itinerary for mobile.",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "AutoPacific", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  colorScheme: "light dark",
  themeColor: "#f4f6f8",
};

export default async function AutopacificMobilePage({ searchParams }: { searchParams: Promise<{ view?: string | string[]; job?:string }> }) {
  const query = await searchParams;
  const requestedView = typeof query.view === "string" ? query.view : undefined;
  return <AutopacificWorkspace experience="mobile" requestedView={requestedView} requestedJobId={query.job} />;
}
