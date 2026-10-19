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

export default async function AutopacificPage() {
  const userAgent = (await headers()).get("user-agent") ?? "";
  if (MOBILE_USER_AGENT_PATTERN.test(userAgent)) redirect("/autopacific/mobile");
  return <AutopacificWorkspace experience="kiosk" />;
}
