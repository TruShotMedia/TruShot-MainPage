import { AutopacificLogin } from "@/components/autopacific/autopacific-login";

export default function MarketingLoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  return <AutopacificLogin searchParams={searchParams} surface="marketing" />;
}
