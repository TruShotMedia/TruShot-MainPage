import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { ACTIVE_CLIENT_REQUEST_STATUSES } from "@/lib/client-requests";
import { TRUSHOT_WORKSPACE_ID } from "@/lib/config";
import { getAdminContext } from "@/lib/data/admin";
import { getNotionConfigurationSummary } from "@/lib/notion/config";

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const context = await getAdminContext();
  if (!context) redirect("/admin/login");
  const notion = getNotionConfigurationSummary();
  const { count, error } = await context.supabase
    .from("website-enquiries")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .in("status", [...ACTIVE_CLIENT_REQUEST_STATUSES])
    .is("archived_at", null);
  if (error) throw new Error("Client request notifications could not be counted.");

  return (
    <AdminShell
      displayName={context.membership.display_name ?? "TruShot Owner"}
      role={context.membership.role}
      pendingRequestCount={count ?? 0}
      notionSyncEnabled={notion.configured}
      notionSyncIntervalMinutes={notion.syncIntervalMinutes}
    >
      {children}
    </AdminShell>
  );
}
