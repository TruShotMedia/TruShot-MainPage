import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AutopacificWorkspace } from "@/components/autopacific/autopacific-workspace";

const MOBILE_USER_AGENT_PATTERN = /iPhone|iPod|Android.+Mobile/i;

export const metadata: Metadata = {
  title: "Autopacific Production",
  description: "TruShot Media's protected Autopacific Group production workspace.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#07100b",
};

export default async function AutopacificPage({ searchParams }: { searchParams: Promise<{ view?: string | string[] }> }) {
  const query = await searchParams;
  const requestedView = typeof query.view === "string" ? query.view : undefined;
  const userAgent = (await headers()).get("user-agent") ?? "";
  if (MOBILE_USER_AGENT_PATTERN.test(userAgent)) {
    redirect(requestedView ? `/autopacific/mobile?view=${encodeURIComponent(requestedView)}` : "/autopacific/mobile");
  }
  return <AutopacificWorkspace experience="kiosk" requestedView={requestedView} />;
}
