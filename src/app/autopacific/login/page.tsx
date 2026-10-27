import { AutopacificLogin } from "@/components/autopacific/autopacific-login";
import type { Metadata } from "next";

export const metadata: Metadata = { title: { absolute: "Sign in | AutoPacific Production" } };

export default function AutopacificLoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  return <AutopacificLogin searchParams={searchParams} />;
}
