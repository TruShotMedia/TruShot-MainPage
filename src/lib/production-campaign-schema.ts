import { z } from "zod";

const date = z.iso.date().nullable();
export const campaignPlanSchema = z.object({
  assignee_ids: z.array(z.uuid()).min(1).max(100).optional(),
  id: z.uuid(), title: z.string().trim().min(2, "Give the campaign a title.").max(180),
  objective: z.string().max(3000).nullable(), notes: z.string().max(8000).nullable(),
  start_date: z.iso.date(), updated_at: z.iso.datetime({ offset: true }).nullable(),
  weeks: z.array(z.object({
    id: z.uuid(), title: z.string().trim().max(180),
    jobs: z.array(z.object({
      assignee_ids: z.array(z.uuid()).min(1).max(100).optional(),
      id: z.uuid(), title: z.string().trim().min(2, "Give every job a title.").max(220), status_id: z.uuid(),
      shoot_date: date, due_date: date, description: z.string().max(2000).nullable(), location: z.string().max(300).nullable(),
      updated_at: z.iso.datetime({ offset: true }).nullable(),
      deliverables: z.array(z.object({ id: z.uuid(), name: z.string().trim().min(1).max(300), date })).max(30)
        .refine(items => new Set(items.map(item => item.id)).size === items.length, "Deliverable identifiers must be unique."),
    }).refine(job => !job.shoot_date || !job.due_date || job.due_date >= job.shoot_date, "A job's due date cannot be before its shoot date.")).min(1, "Add at least one job to every week.").max(20),
  })).min(1, "Keep at least one week in the campaign.").max(52),
}).superRefine((plan, context) => {
  const ids = [plan.id, ...plan.weeks.map(week => week.id), ...plan.weeks.flatMap(week => week.jobs.map(job => job.id))];
  if (new Set(ids).size !== ids.length) context.addIssue({ code: "custom", message: "Each week and job must have its own identifier." });
  if (plan.weeks.reduce((sum, week) => sum + week.jobs.length, 0) > 300) context.addIssue({ code: "custom", message: "Keep each campaign within 300 jobs." });
});
