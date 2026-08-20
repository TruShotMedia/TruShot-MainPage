import { ExternalLink } from "lucide-react";
import { updateWebsiteVisibility } from "@/app/admin/actions";
import { PageHeader } from "@/components/admin/page-header";
import { SubmitButton } from "@/components/admin/submit-button";
import { WebsiteElementEditor } from "@/components/admin/website-element-editor";
import { TRUSHOT_WORKSPACE_ID } from "@/lib/config";
import { getWebsiteElementsAdmin, getWebsiteVisibilityAdmin } from "@/lib/data/admin";
import type { WebsiteElement } from "@/lib/types";

export default async function WebsiteElementsPage() {
  const [elements, visibility] = await Promise.all([
    getWebsiteElementsAdmin() as Promise<WebsiteElement[]>,
    getWebsiteVisibilityAdmin(),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Public website"
        title="Website Elements"
        description="Shape the growth-partner story customers see. Every service and About media slot accepts an image or video, and supporting copy can be updated without touching code. Saved changes publish immediately."
        actions={<a className="admin-primary-button" href="/" target="_blank" rel="noreferrer">View website <ExternalLink size={14} /></a>}
      />
      <form action={updateWebsiteVisibility} className="admin-card website-visibility-form">
        <div>
          <p className="card-label">Landing page</p>
          <h2>Pricing visibility</h2>
          <p>Turn pricing off to remove the pricing navigation, package cards and package selector. The general enquiry form stays available.</p>
        </div>
        <label className="website-visibility-toggle">
          <input name="show_pricing" type="checkbox" defaultChecked={visibility.show_pricing} />
          <span><strong>Show pricing publicly</strong><small>{visibility.show_pricing ? "Pricing is currently visible." : "Visitors currently enquire without selecting a package."}</small></span>
        </label>
        <SubmitButton pendingLabel="Saving…">Save visibility</SubmitButton>
      </form>
      <div className="formula-note website-guidance">
        <p><strong>Media guidance:</strong> Every slot accepts an image or a short, silent-friendly MP4/MOV/WebM video loop. Landscape media with the subject near the centre works best, and compressed files keep the mobile experience fast.</p>
      </div>
      <div className="website-elements-grid">
        {elements.map((element, index) => (
          <WebsiteElementEditor
            element={element}
            key={element.id}
            number={String(index + 1).padStart(2, "0")}
            workspaceId={TRUSHOT_WORKSPACE_ID}
          />
        ))}
      </div>
    </>
  );
}
