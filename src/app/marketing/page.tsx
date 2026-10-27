import { headers } from "next/headers";
import { AutopacificWorkspace } from "@/components/autopacific/autopacific-workspace";
import "@/app/autopacific/mobile/autopacific-mobile.css";

export default async function MarketingPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const [query, requestHeaders] = await Promise.all([searchParams, headers()]);
  const mobile = /iPhone|iPod|Android.+Mobile/i.test(requestHeaders.get("user-agent") ?? "");
  return <AutopacificWorkspace mode="marketing" experience={mobile ? "mobile" : "kiosk"} requestedView={typeof query.view === "string" ? query.view : undefined} />;
}
