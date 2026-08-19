import { ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { WebsiteElementEditor } from "@/components/admin/website-element-editor";
import { TRUSHOT_WORKSPACE_ID } from "@/lib/config";
import { getWebsiteElementsAdmin } from "@/lib/data/admin";
import type { WebsiteElement } from "@/lib/types";

export default async function WebsiteElementsPage() {
  const elements = await getWebsiteElementsAdmin() as WebsiteElement[];

  return (
    <>
      <PageHeader
        eyebrow="Public website"
        title="Website Elements"
        description="Shape the growth-partner story customers see. Every service and About media slot accepts an image or video, and supporting copy can be updated without touching code. Saved changes publish immediately."
        actions={<a className="admin-primary-button" href="/" target="_blank" rel="noreferrer">View website <ExternalLink size={14} /></a>}
      />
      <div className="formula-note website-guidance">
        <p><strong>Media guidance:</strong> Every slot accepts an image or a short, silent-friendly MP4/WebM video loop. Landscape media with the subject near the centre works best, and compressed files keep the mobile experience fast.</p>
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
