import type { Metadata, Viewport } from "next";
import { jobProgressBrand } from "@/lib/job-progress-brand";
import { jobProgressLinkOrigin } from "@/lib/job-progress-host";
import { SITE_URL } from "@/lib/config";
import { JobProgressDashboard } from "./progress-dashboard";
import "./progress.css";

export const metadata: Metadata = {
  metadataBase: new URL(jobProgressLinkOrigin(SITE_URL)),
  title: { absolute: `Job progress | ${jobProgressBrand.name}` },
  applicationName: jobProgressBrand.name,
  description: "View AutoPacific Group job progress with a six-digit PIN.",
  keywords: [],
  robots: { index: false, follow: false, noarchive: true },
  openGraph: { title: "Job progress", description: "A PIN-protected progress dashboard.", siteName: jobProgressBrand.name, images: [jobProgressBrand.logo] },
  twitter: { card: "summary", title: `Job progress | ${jobProgressBrand.name}`, description: "A PIN-protected progress dashboard.", images: [jobProgressBrand.logo] },
  icons: { icon: jobProgressBrand.icon, apple: "/autopacific/icons/192" },
  manifest: "/job-progress.webmanifest",
  appleWebApp: { capable: false, title: jobProgressBrand.name },
  alternates: { canonical: "/job-progress" },
};

export const viewport: Viewport = { themeColor: "#e7f0ff" };

export default function JobProgressPage() {
  return <JobProgressDashboard />;
}
