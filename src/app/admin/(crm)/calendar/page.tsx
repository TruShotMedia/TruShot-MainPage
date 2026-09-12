import { CalendarDays } from "lucide-react";
import { CalendarManager } from "@/components/admin/calendar-manager";
import { CalendarReminderSettingsPanel } from "@/components/admin/calendar-reminder-settings";
import { PageHeader } from "@/components/admin/page-header";
import { getCalendarData } from "@/lib/data/admin";

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ item?: string }> }) {
  const { item } = await searchParams;
  const data = await getCalendarData();
  return (
    <>
      <PageHeader
        eyebrow="Production planning"
        title="Calendar"
        description="Plan production windows, set exact times and let TruShot remind you before work starts or becomes due. Completed work stays visible in grey for context."
        actions={<div className="calendar-page-badge"><CalendarDays size={16} /> Deadline command centre</div>}
      />
      <CalendarReminderSettingsPanel settings={data.reminderSettings} />
      <CalendarManager jobs={data.jobs} tasks={data.tasks} campaignAssets={data.campaignAssets} initialItemId={item} />
    </>
  );
}
