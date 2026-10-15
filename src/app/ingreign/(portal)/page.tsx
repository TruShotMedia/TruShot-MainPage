import { CalendarDays } from "lucide-react";
import { IngreignCalendar } from "@/components/ingreign/ingreign-calendar";
import { getIngreignEventsData } from "@/lib/data/ingreign";

export default async function IngreignCalendarPage() {
  const data = await getIngreignEventsData();
  if (!data) return null;
  return (
    <>
      <header className="ingreign-page-header">
        <div><span><CalendarDays size={15} /> Posting rhythm</span><h1>Your year,<br />already mapped.</h1></div>
        <p>Every INGREIGN event and the six moments leading into it—ready to open, create and post.</p>
      </header>
      <IngreignCalendar manualEvents={data.manualEvents} />
    </>
  );
}

