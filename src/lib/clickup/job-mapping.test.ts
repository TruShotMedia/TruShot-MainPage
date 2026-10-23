import { describe, expect, it } from "vitest";
import { buildClickUpJobDescription, buildClickUpJobPayload, buildClickUpJobUpdatePayload, buildClickUpOwnedFieldsPayload, type ClickUpJobSnapshot } from "@/lib/clickup/job-mapping";

const job: ClickUpJobSnapshot = {
  id: "22222222-2222-4222-8222-222222222222",
  title: "Spring launch capture",
  job_number: "JOB-0042",
  description: "Capture the launch range.",
  shoot_date: "2026-10-20",
  shoot_time: "09:30:00",
  due_date: "2026-10-24",
  due_time: "17:00:00",
  location: "Brisbane",
  delivery_url: "https://files.example.com/spring-launch",
  photos_delivered: 24,
  notes: "Prioritise the hero model.",
};

describe("ClickUp job mapping", () => {
  it("builds a useful client-facing task description without losing the CRM identity", () => {
    const description = buildClickUpJobDescription(job);
    expect(description).toContain("**CRM job:** JOB-0042");
    expect(description).toContain("[Open delivered files](https://files.example.com/spring-launch)");
    expect(description).toContain("Prioritise the hero model.");
    expect(description).toContain(job.id);
  });

  it("converts Brisbane shoot and due times to ClickUp millisecond timestamps", () => {
    const payload = buildClickUpJobPayload({ assignedUserId: 183, job, status: "EDITING" });
    expect(payload).toMatchObject({
      name: "Spring launch capture",
      status: "EDITING",
      assignees: [183],
      start_date_time: true,
      due_date_time: true,
    });
    expect(payload.start_date).toBe(Date.parse("2026-10-20T09:30:00+10:00"));
    expect(payload.due_date).toBe(Date.parse("2026-10-24T17:00:00+10:00"));
  });

  it("uses ClickUp's add/remove assignee format when updating an existing task", () => {
    const payload = buildClickUpJobUpdatePayload({ assignedUserId: 183, job, status: "APPROVAL" });
    expect(payload.assignees).toEqual({ add: [183], rem: [] });
    expect(payload.archived).toBe(false);
  });

  it("can refresh CRM-owned detail without overwriting ClickUp-owned shared fields", () => {
    const payload = buildClickUpOwnedFieldsPayload({ assignedUserId: 183, job });
    expect(payload).toMatchObject({
      assignees: { add: [183], rem: [] },
      archived: false,
    });
    expect(payload.markdown_content).toContain("Prioritise the hero model.");
    expect(payload).not.toHaveProperty("name");
    expect(payload).not.toHaveProperty("status");
    expect(payload).not.toHaveProperty("start_date");
    expect(payload).not.toHaveProperty("due_date");
  });
});
