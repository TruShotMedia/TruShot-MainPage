import { Send } from "lucide-react";
import { isCalendarPost } from "@/lib/calendar-event";
import "./calendar-post-mark.css";

export function CalendarPostMark({ item, size = 12 }: { item: Parameters<typeof isCalendarPost>[0]; size?: number }) {
  if (!isCalendarPost(item)) return null;
  return <Send size={size} role="img" aria-label="Scheduled post" className="calendar-post-mark" />;
}
