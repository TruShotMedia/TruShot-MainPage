import { ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { PortfolioManager } from "@/components/admin/portfolio-manager";
import { TRUSHOT_WORKSPACE_ID } from "@/lib/config";
import { getPortfolioItemsAdmin } from "@/lib/data/admin";
import type { PortfolioItem } from "@/lib/types";

export default async function PortfolioAdminPage() {
  const items = await getPortfolioItemsAdmin() as PortfolioItem[];

  return (
    <>
      <PageHeader
        eyebrow="Private showcase"
        title="Portfolio"
        description="Curate the work shown at your unlisted /portfolio link. Upload photos or videos, compose the grid with tile shapes, and remove media when the collection changes."
        actions={<a className="admin-primary-button" href="/portfolio" target="_blank" rel="noreferrer">Open private link <ExternalLink size={14} /></a>}
      />
      <div className="formula-note website-guidance">
        <p><strong>Private-link behaviour:</strong> this page is excluded from public navigation, the sitemap and search indexing. Anyone you send the exact URL to can still view it, so only publish work cleared for client presentation.</p>
      </div>
      <PortfolioManager items={items} workspaceId={TRUSHOT_WORKSPACE_ID} />
    </>
  );
}
