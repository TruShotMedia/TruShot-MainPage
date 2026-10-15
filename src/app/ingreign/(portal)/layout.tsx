import { redirect } from "next/navigation";
import { IngreignShell } from "@/components/ingreign/ingreign-shell";
import { getIngreignContext } from "@/lib/data/ingreign";

export default async function IngreignPortalLayout({ children }: { children: React.ReactNode }) {
  const context = await getIngreignContext();
  if (!context) redirect("/ingreign/login");
  return <IngreignShell displayName={context.membership.display_name ?? "INGREIGN"}>{children}</IngreignShell>;
}

