"use client";

import { createContext, useContext } from "react";
import { isCalendarPost } from "@/lib/calendar-event";
import type { CalendarCustomEvent } from "@/lib/types";
import "./calendar-post-completion.css";

export const CalendarPostCompletion = createContext<{
  pendingId: string | null;
  toggle: (post: CalendarCustomEvent) => void;
} | null>(null);

export function useCalendarPostControl(source: { entity_type: string }) {
  const completion = useContext(CalendarPostCompletion);
  const post = source.entity_type === "calendar-event" ? source as CalendarCustomEvent : null;
  if (!post || !isCalendarPost(post) || !completion) return null;
  return {
    completed: Boolean(post.post_completed_at),
    label: `Mark ${post.title} ${post.post_completed_at ? "not complete" : "complete"}`,
    pending: completion.pendingId === post.id,
    disabled: completion.pendingId !== null,
    toggle: () => completion.toggle(post),
  };
}
