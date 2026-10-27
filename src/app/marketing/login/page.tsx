import { AutopacificLogin } from "@/components/autopacific/autopacific-login";
import type { Metadata } from "next";

export const metadata: Metadata = { title: { absolute: "Sign in | AutoPacific Marketing" } };

export default function MarketingLoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  return <AutopacificLogin searchParams={searchParams} surface="marketing" />;
}
