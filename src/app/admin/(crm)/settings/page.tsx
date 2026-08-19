import { Save } from "lucide-react";
import { updateSettings } from "@/app/admin/actions";
import { PageHeader } from "@/components/admin/page-header";
import { TRUSHOT_WORKSPACE_ID } from "@/lib/config";
import { getAdminContext } from "@/lib/data/admin";

export default async function SettingsPage() {
  const context = await getAdminContext();
  if (!context) return null;
  const [{ data: settings }, { data: tax }] = await Promise.all([
    context.supabase.from("website-settings").select("*").eq("workspace_id", TRUSHOT_WORKSPACE_ID).single(),
    context.supabase.from("website-tax-settings").select("*").eq("workspace_id", TRUSHOT_WORKSPACE_ID).single(),
  ]);
  return (
    <>
      <PageHeader eyebrow="Workspace control" title="Settings" description="Business identity, search presentation, tax assumptions and the core controls for the TruShot workspace." />
      <form action={updateSettings} className="settings-form">
        <section className="admin-card settings-section"><div><p className="card-label">Business</p><h2>Identity & contact</h2><p>Used for customer-facing details and operational defaults.</p></div><div className="settings-fields"><label>Business name<input name="business_name" defaultValue={settings?.business_name} required /></label><label>Legal name<input name="legal_name" defaultValue={settings?.legal_name ?? ""} /></label><label>Email<input name="email" type="email" defaultValue={settings?.email} required /></label><label>Phone<input name="phone" defaultValue={settings?.phone ?? ""} /></label><label>ABN<input name="abn" defaultValue={settings?.abn ?? ""} /></label><label className="toggle-field"><input name="is_gst_registered" type="checkbox" defaultChecked={tax?.is_gst_registered} /><span><strong>GST registered</strong><small>Controls GST estimates and reporting labels.</small></span></label></div></section>
        <section className="admin-card settings-section"><div><p className="card-label">Search</p><h2>SEO presentation</h2><p>Default title and description shown to search engines and social previews.</p></div><div className="settings-fields"><label className="form-span">SEO title<input name="seo_title" defaultValue={settings?.seo_title} minLength={20} maxLength={70} required /></label><label className="form-span">SEO description<textarea name="seo_description" defaultValue={settings?.seo_description} minLength={50} maxLength={170} rows={4} required /></label></div></section>
        <div className="settings-save"><button className="admin-primary-button" type="submit"><Save size={16} /> Save settings</button></div>
      </form>
    </>
  );
}
