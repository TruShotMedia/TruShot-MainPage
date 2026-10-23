import { Save } from "lucide-react";
import { updateSettings } from "@/app/admin/actions";
import {
  ClickUpSyncPanel,
  type ClickUpAuditItem,
  type ClickUpConflict,
  type ClickUpPanelIntegration,
} from "@/components/admin/clickup-sync-panel";
import { NotionSyncPanel } from "@/components/admin/notion-sync-panel";
import { PageHeader } from "@/components/admin/page-header";
import { PushNotificationSettings } from "@/components/admin/push-notification-settings";
import { TRUSHOT_WORKSPACE_ID } from "@/lib/config";
import { getAdminContext } from "@/lib/data/admin";
import { getNotionConfigurationSummary } from "@/lib/notion/config";
import { getClickUpConfigurationSummary } from "@/lib/clickup/config";
import type { NotionSyncResult } from "@/lib/notion/types";

export default async function SettingsPage() {
  const context = await getAdminContext();
  if (!context) return null;
  const notionConfiguration = getNotionConfigurationSummary();
  const clickUpConfiguration = getClickUpConfigurationSummary();
  const [{ data: settings }, { data: tax }, { data: notionSync }, pushSubscriptions, clickUpIntegration, clickUpLinks, clickUpEventLinks, clickUpFlightLinks, clickUpPending, clickUpEventPending, clickUpFlightPending, clickUpFailed, clickUpEventFailed, clickUpFlightFailed, clickUpInboundPending, clickUpInboundFailed, clickUpConflicts, clickUpConflictJobs, clickUpAudit] = await Promise.all([
    context.supabase.from("website-settings").select("*").eq("workspace_id", TRUSHOT_WORKSPACE_ID).single(),
    context.supabase.from("website-tax-settings").select("*").eq("workspace_id", TRUSHOT_WORKSPACE_ID).single(),
    context.supabase.from("website-notion-sync-state").select("status,last_successful_at,last_error,last_result").eq("workspace_id", TRUSHOT_WORKSPACE_ID).maybeSingle(),
    context.supabase.from("website-push-subscriptions").select("id", { count: "exact", head: true }).eq("user_id", context.claims.sub),
    context.supabase.from("website-clickup-integrations").select("enabled,list_id,list_name,assigned_user_name,status_mapping,last_connected_at,last_sync_completed_at,last_error,inbound_mode,import_new_tasks,archive_on_remote_delete,reconciliation_enabled,webhook_id,webhook_health,webhook_fail_count,last_webhook_received_at,last_reconciled_at").eq("workspace_id", TRUSHOT_WORKSPACE_ID).maybeSingle(),
    context.supabase.from("website-clickup-job-links").select("id", { count: "exact", head: true }).eq("workspace_id", TRUSHOT_WORKSPACE_ID),
    context.supabase.from("website-clickup-calendar-event-links").select("id", { count: "exact", head: true }).eq("workspace_id", TRUSHOT_WORKSPACE_ID),
    context.supabase.from("website-clickup-flight-event-links").select("id", { count: "exact", head: true }).eq("workspace_id", TRUSHOT_WORKSPACE_ID),
    context.supabase.from("website-clickup-sync-outbox").select("id", { count: "exact", head: true }).eq("workspace_id", TRUSHOT_WORKSPACE_ID).in("status", ["pending", "retry", "processing"]),
    context.supabase.from("website-clickup-calendar-event-outbox").select("id", { count: "exact", head: true }).eq("workspace_id", TRUSHOT_WORKSPACE_ID).in("status", ["pending", "retry", "processing"]),
    context.supabase.from("website-clickup-flight-event-outbox").select("id", { count: "exact", head: true }).eq("workspace_id", TRUSHOT_WORKSPACE_ID).in("status", ["pending", "retry", "processing"]),
    context.supabase.from("website-clickup-sync-outbox").select("id", { count: "exact", head: true }).eq("workspace_id", TRUSHOT_WORKSPACE_ID).eq("status", "failed"),
    context.supabase.from("website-clickup-calendar-event-outbox").select("id", { count: "exact", head: true }).eq("workspace_id", TRUSHOT_WORKSPACE_ID).eq("status", "failed"),
    context.supabase.from("website-clickup-flight-event-outbox").select("id", { count: "exact", head: true }).eq("workspace_id", TRUSHOT_WORKSPACE_ID).eq("status", "failed"),
    context.supabase.from("website-clickup-webhook-events").select("id", { count: "exact", head: true }).eq("workspace_id", TRUSHOT_WORKSPACE_ID).in("status", ["pending", "retry", "processing"]),
    context.supabase.from("website-clickup-webhook-events").select("id", { count: "exact", head: true }).eq("workspace_id", TRUSHOT_WORKSPACE_ID).eq("status", "failed"),
    context.supabase.from("website-clickup-conflicts").select("id,job_id,clickup_task_id,conflict_type,changed_fields,crm_snapshot,clickup_snapshot,created_at").eq("workspace_id", TRUSHOT_WORKSPACE_ID).eq("status", "open").order("created_at", { ascending: false }).limit(10),
    context.supabase.from("website-jobs").select("id,title").eq("workspace_id", TRUSHOT_WORKSPACE_ID),
    context.supabase.from("website-clickup-sync-audit").select("id,direction,action,outcome,detail,created_at").eq("workspace_id", TRUSHOT_WORKSPACE_ID).order("created_at", { ascending: false }).limit(8),
  ]);
  return (
    <>
      <PageHeader eyebrow="Workspace control" title="Settings" description="Business identity, search presentation, tax assumptions and the core controls for the TruShot workspace." />
      <form action={updateSettings} className="settings-form">
        <section className="admin-card settings-section"><div><p className="card-label">Business</p><h2>Identity & contact</h2><p>Used for customer-facing details and operational defaults.</p></div><div className="settings-fields"><label>Business name<input name="business_name" defaultValue={settings?.business_name} required /></label><label>Legal name<input name="legal_name" defaultValue={settings?.legal_name ?? ""} /></label><label>Email<input name="email" type="email" defaultValue={settings?.email} required /></label><label>Phone<input name="phone" defaultValue={settings?.phone ?? ""} /></label><label>ABN<input name="abn" defaultValue={settings?.abn ?? ""} /></label><label>GST accounting basis<select name="estimate_basis" defaultValue={tax?.estimate_basis === "accrual" ? "accrual" : "cash"}><option value="cash">Cash · when paid</option><option value="accrual">Non-cash · when issued</option></select><small>Used for BAS planning reports. Match the basis registered with the ATO.</small></label><label className="toggle-field"><input name="is_gst_registered" type="checkbox" defaultChecked={tax?.is_gst_registered} /><span><strong>GST registered</strong><small>Controls GST estimates and reporting labels.</small></span></label></div></section>
        <section className="admin-card settings-section"><div><p className="card-label">Search</p><h2>SEO presentation</h2><p>Default title and description shown to search engines and social previews.</p></div><div className="settings-fields"><label className="form-span">SEO title<input name="seo_title" defaultValue={settings?.seo_title} minLength={20} maxLength={70} required /></label><label className="form-span">SEO description<textarea name="seo_description" defaultValue={settings?.seo_description} minLength={50} maxLength={170} rows={4} required /></label></div></section>
        <div className="settings-save"><button className="admin-primary-button" type="submit"><Save size={16} /> Save settings</button></div>
      </form>
      <PushNotificationSettings
        publicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""}
        initialDeviceCount={pushSubscriptions.count ?? 0}
      />
      <NotionSyncPanel
        configured={notionConfiguration.configured}
        intervalMinutes={notionConfiguration.syncIntervalMinutes}
        lastError={notionSync?.last_error ?? null}
        lastResult={(notionSync?.last_result as NotionSyncResult | null) ?? null}
        lastSuccessfulAt={notionSync?.last_successful_at ?? null}
        status={notionSync?.status ?? "idle"}
      />
      <ClickUpSyncPanel
        configured={clickUpConfiguration.configured}
        webhookEncryptionConfigured={clickUpConfiguration.webhookEncryptionConfigured}
        failedCount={(clickUpFailed.count ?? 0) + (clickUpEventFailed.count ?? 0) + (clickUpFlightFailed.count ?? 0)}
        inboundFailedCount={clickUpInboundFailed.count ?? 0}
        inboundPendingCount={clickUpInboundPending.count ?? 0}
        integration={(clickUpIntegration.data as ClickUpPanelIntegration) ?? null}
        linkedCount={(clickUpLinks.count ?? 0) + (clickUpEventLinks.count ?? 0) + (clickUpFlightLinks.count ?? 0)}
        pendingCount={(clickUpPending.count ?? 0) + (clickUpEventPending.count ?? 0) + (clickUpFlightPending.count ?? 0)}
        conflicts={((clickUpConflicts.data ?? []) as Omit<ClickUpConflict, "job_title">[]).map((conflict) => ({
          ...conflict,
          job_title: clickUpConflictJobs.data?.find((job) => job.id === conflict.job_id)?.title ?? null,
        }))}
        audit={(clickUpAudit.data ?? []) as ClickUpAuditItem[]}
      />
    </>
  );
}
