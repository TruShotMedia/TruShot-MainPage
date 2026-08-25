import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { getAdminContext } from "@/lib/data/admin";
import { getNotionConfigurationSummary } from "@/lib/notion/config";

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const context = await getAdminContext();
  if (!context) redirect("/admin/login");
  const notion = getNotionConfigurationSummary();
  const { count } = await context.supabase
    .from("website-notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);

  return (
    <AdminShell
      displayName={context.membership.display_name ?? "TruShot Owner"}
      role={context.membership.role}
      unread={count ?? 0}
      notionSyncEnabled={notion.configured}
      notionSyncIntervalMinutes={notion.syncIntervalMinutes}
    >
      {children}
    </AdminShell>
  );
}
