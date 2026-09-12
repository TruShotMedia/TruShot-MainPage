import { CalendarDays } from "lucide-react";
import { CalendarManager } from "@/components/admin/calendar-manager";
import { PageHeader } from "@/components/admin/page-header";
import { getCalendarData } from "@/lib/data/admin";

export default async function CalendarPage() {
  const data = await getCalendarData();
  return (
    <>
      <PageHeader
        eyebrow="Production planning"
        title="Calendar"
        description="See each job as a clear production-to-deadline window, with overlapping work staggered into tidy lanes. Completed work stays visible in grey for context."
        actions={<div className="calendar-page-badge"><CalendarDays size={16} /> Deadline command centre</div>}
      />
      <CalendarManager jobs={data.jobs} tasks={data.tasks} campaignAssets={data.campaignAssets} />
    </>
  );
}
