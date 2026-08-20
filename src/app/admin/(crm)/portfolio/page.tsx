import { ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { PortfolioManager } from "@/components/admin/portfolio-manager";
import { TRUSHOT_WORKSPACE_ID } from "@/lib/config";
import { getPortfolioCategoriesAdmin } from "@/lib/data/admin";

export default async function PortfolioAdminPage() {
  const categories = await getPortfolioCategoriesAdmin();

  return (
    <>
      <PageHeader
        eyebrow="Private showcase"
        title="Portfolio"
        description="Create project or service categories, then batch-upload photos and videos into each collection shown at your unlisted /portfolio link."
        actions={<a className="admin-primary-button" href="/portfolio" target="_blank" rel="noreferrer">Open private link <ExternalLink size={14} /></a>}
      />
      <div className="formula-note website-guidance">
        <p><strong>Private-link behaviour:</strong> this page is excluded from public navigation, the sitemap and search indexing. Anyone you send the exact URL to can still view it, so only publish work cleared for client presentation.</p>
      </div>
      <PortfolioManager categories={categories} workspaceId={TRUSHOT_WORKSPACE_ID} />
    </>
  );
}
