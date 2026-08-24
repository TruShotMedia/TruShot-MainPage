import { ClientRequestManager } from "@/components/admin/client-request-manager";
import { PageHeader } from "@/components/admin/page-header";
import { getEnquiries } from "@/lib/data/admin";
import { todayDateInput } from "@/lib/format";

export default async function RequestsPage() {
  const enquiries = await getEnquiries();
  return (
    <>
      <PageHeader
        eyebrow="New business"
        title="Client requests"
        description="Qualify every website enquiry from first review to client conversion. Reject unsuitable work with a clear reason, then archive it without losing the history."
      />
      <ClientRequestManager enquiries={enquiries} today={todayDateInput()} />
    </>
  );
}
