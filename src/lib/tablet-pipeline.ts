import { visiblePipelineStatuses } from "@/lib/status-workflow";
import type { PipelineTask, TaskStatus } from "@/lib/types";

function calendarDayNumber(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

export function getTabletWorkload(tasks: PipelineTask[], statuses: TaskStatus[], today: string) {
  const activeStatusIds = new Set(visiblePipelineStatuses(statuses).map((status) => status.id));
  const activeTasks = tasks.filter((task) => activeStatusIds.has(task.status_id));
  const todayNumber = calendarDayNumber(today);

  return {
    active: activeTasks.length,
    overdue: activeTasks.filter((task) => task.due_date && task.due_date < today).length,
    upcoming: activeTasks.filter((task) => {
      if (!task.due_date || task.due_date < today) return false;
      return calendarDayNumber(task.due_date) - todayNumber <= 7;
    }).length,
  };
}
