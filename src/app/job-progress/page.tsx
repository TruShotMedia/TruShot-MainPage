import type { Metadata } from "next";
import { JobProgressDashboard } from "./progress-dashboard";
import "./progress.css";

export const metadata: Metadata = {
  title: { absolute: "Job progress | TruShot Media" },
  description: "View a shared job’s progress with its six-digit PIN.",
  robots: { index: false, follow: false, noarchive: true },
  openGraph: { title: "Job progress", description: "A PIN-protected progress dashboard." },
  twitter: { title: "Job progress", description: "A PIN-protected progress dashboard." },
  alternates: { canonical: "/job-progress" },
};

export default function JobProgressPage() {
  return <JobProgressDashboard />;
}
