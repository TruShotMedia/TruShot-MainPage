export type ClickUpJobSnapshot = {
  id: string;
  title: string;
  job_number: string | null;
  description: string | null;
  shoot_date: string | null;
  shoot_time: string | null;
  due_date: string | null;
  due_time: string | null;
  location: string | null;
  delivery_url: string | null;
  photos_delivered: number;
  notes: string | null;
};

function brisbaneTimestamp(date: string | null, time: string | null) {
  if (!date) return null;
  const normalisedTime = time?.slice(0, 5) || "00:00";
  const timestamp = Date.parse(`${date}T${normalisedTime}:00+10:00`);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function clean(value: string | null) {
  return value?.trim() || null;
}

export function buildClickUpJobDescription(job: ClickUpJobSnapshot) {
  const details = [
    job.job_number ? `**CRM job:** ${job.job_number}` : null,
    clean(job.location) ? `**Location:** ${job.location?.trim()}` : null,
    job.photos_delivered > 0 ? `**Photos delivered:** ${job.photos_delivered}` : null,
    clean(job.delivery_url) ? `**Delivery:** [Open delivered files](${job.delivery_url?.trim()})` : null,
  ].filter(Boolean);
  const sections = [
    details.join("  \n"),
    clean(job.description),
    clean(job.notes) ? `**Production notes**\n${job.notes?.trim()}` : null,
    `---\nSynced from TruShot CRM · Job ID: \`${job.id}\``,
  ].filter(Boolean);
  return sections.join("\n\n");
}

export function buildClickUpJobPayload({
  assignedUserId,
  job,
  status,
}: {
  assignedUserId: number;
  job: ClickUpJobSnapshot;
  status: string;
}) {
  const startDate = brisbaneTimestamp(job.shoot_date, job.shoot_time);
  const dueDate = brisbaneTimestamp(job.due_date, job.due_time);
  return {
    name: job.title,
    markdown_content: buildClickUpJobDescription(job),
    status,
    archived: false,
    assignees: [assignedUserId],
    start_date: startDate,
    start_date_time: Boolean(job.shoot_date && job.shoot_time),
    due_date: dueDate,
    due_date_time: Boolean(job.due_date && job.due_time),
  };
}

export function buildClickUpJobUpdatePayload(input: Parameters<typeof buildClickUpJobPayload>[0]) {
  const payload = buildClickUpJobPayload(input);
  return {
    ...payload,
    assignees: { add: [input.assignedUserId], rem: [] },
  };
}

export function buildClickUpOwnedFieldsPayload({
  assignedUserId,
  job,
}: Pick<Parameters<typeof buildClickUpJobPayload>[0], "assignedUserId" | "job">) {
  return {
    markdown_content: buildClickUpJobDescription(job),
    archived: false,
    assignees: { add: [assignedUserId], rem: [] },
  };
}
