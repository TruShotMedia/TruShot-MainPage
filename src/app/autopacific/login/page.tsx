import { AutopacificLogin } from "@/components/autopacific/autopacific-login";

export default function AutopacificLoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  return <AutopacificLogin searchParams={searchParams} />;
}
