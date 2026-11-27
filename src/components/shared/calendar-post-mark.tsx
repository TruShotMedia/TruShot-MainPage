import { Check, Send } from "lucide-react";
import { isCalendarPost } from "@/lib/calendar-event";
import "./calendar-post-mark.css";

export function CalendarPostMark({ item, size = 12 }: { item: Parameters<typeof isCalendarPost>[0] & { post_completed_at?: string | null }; size?: number }) {
  if (!isCalendarPost(item)) return null;
  if (item.post_completed_at) return <Check size={size} role="img" aria-label="Scheduled post completed" className="calendar-post-mark" />;
  return <Send size={size} role="img" aria-label="Scheduled post" className="calendar-post-mark" />;
}
