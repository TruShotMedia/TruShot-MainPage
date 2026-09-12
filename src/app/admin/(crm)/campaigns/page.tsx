import { Plus, WandSparkles } from "lucide-react";
import { createCampaign } from "@/app/admin/campaign-actions";
import { ActionPopover } from "@/components/admin/action-popover";
import { CampaignManager } from "@/components/admin/campaign-manager";
import { PageHeader } from "@/components/admin/page-header";
import { SubmitButton } from "@/components/admin/submit-button";
import { TRUSHOT_WORKSPACE_ID } from "@/lib/config";
import { getCampaigns } from "@/lib/data/admin";

export default async function CampaignsPage() {
  const data = await getCampaigns();
  const openAssets = data.campaigns.flatMap((campaign) => campaign.assets).filter((asset) => asset.status?.is_open !== false);
  const datedAssets = openAssets.filter((asset) => asset.due_date);
  const today = new Date().toISOString().slice(0, 10);
  const overdue = datedAssets.filter((asset) => asset.due_date! < today).length;

  return (
    <>
      <PageHeader
        eyebrow="Campaign command centre"
        title="Campaigns"
        description="Turn a client goal into a clear, chronological flow of deliverables. Every asset keeps its contacts, files, invoice link and calendar deadline in one place."
        actions={(
          <ActionPopover action={createCampaign} summary={<><Plus size={16} /> New campaign</>} title="Create a campaign" formClassName="quick-form wide">
            <label>Campaign name<input name="title" placeholder="Spring growth campaign" required /></label>
            <label>Client<select name="client_id"><option value="">No client yet</option>{data.clients.map((client) => <option value={client.id} key={client.id}>{client.name}</option>)}</select></label>
            <label>Status<select name="status" defaultValue="planning"><option value="planning">Planning</option><option value="active">Active</option><option value="paused">Paused</option><option value="complete">Complete</option></select></label>
            <label>Start date<input type="date" name="start_date" /></label>
            <label>Campaign deadline<input type="date" name="due_date" /></label>
            <label className="form-span">Objective<textarea name="objective" rows={3} placeholder="What should this campaign achieve?" /></label>
            <label className="form-span">Internal notes<textarea name="notes" rows={3} placeholder="Strategy, approvals, dependencies or context." /></label>
            <SubmitButton pendingLabel="Creating campaign…">Create campaign</SubmitButton>
          </ActionPopover>
        )}
      />
      <section className="campaign-kpis" aria-label="Campaign overview">
        <article><span>Active plans</span><strong>{data.campaigns.filter((campaign) => campaign.status === "active").length}</strong><small>{data.campaigns.length} total campaigns</small></article>
        <article><span>Open assets</span><strong>{openAssets.length}</strong><small>{datedAssets.length} scheduled</small></article>
        <article className={overdue ? "is-alert" : ""}><span>Needs attention</span><strong>{overdue}</strong><small>overdue campaign assets</small></article>
        <article className="campaign-kpi-accent"><WandSparkles size={18} /><div><strong>Goal → story → result</strong><small>Dates automatically shape the asset flow.</small></div></article>
      </section>
      <CampaignManager {...data} workspaceId={TRUSHOT_WORKSPACE_ID} />
    </>
  );
}
