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
  it("shows progress in create and update titles and the description, without changing the CRM job", () => {
    const snapshot = { ...job, progress: { completed: 3, total: 4, percent: 75 } };
    expect(buildClickUpJobPayload({ assignedUserId: 183, job: snapshot, status: "EDITING" }).name).toBe("[3/4 · 75%] Spring launch capture");
    expect(buildClickUpJobUpdatePayload({ assignedUserId: 183, job: snapshot, status: "EDITING" }).name).toBe("[3/4 · 75%] Spring launch capture");
    expect(buildClickUpJobDescription(snapshot)).toContain("**Progress:** 3/4 deliverables completed · 75%");
    expect(snapshot.title).toBe(job.title);
  });
  it("exports dated deliverables with parent-deadline fallback and omits empty brief sections",()=>{
    const text=buildClickUpJobDescription({...job,brief_details:{objective:"Show the new range",sections:[{key:"shot_list",body:"Workshop wide"}]},deliverables:[{id:"first",name:"Launch reel",date:null},{id:"second",name:"Photos",date:"2026-10-22"}]});
    expect(text).toContain("Launch reel — 2026-10-24");expect(text).toContain("Photos — 2026-10-22");expect(text).toContain("Workshop wide");
  });
  it("builds a useful client-facing task description without losing the CRM identity", () => {
    const description = buildClickUpJobDescription(job);
    expect(description).toContain("**CRM job:** JOB-0042");
    expect(description).toContain("[Open delivered files](https://files.example.com/spring-launch)");
    expect(description).toContain("Prioritise the hero model.");
    expect(description).toContain("Synced from John's CRM");
    expect(description).not.toContain("Synced from TruShot CRM");
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

  it("omits generated CRM backlinks from new and existing mirrors while retaining delivery links", () => {
    const input = { assignedUserId: 183, job, status: "EDITING" };
    const descriptions = [
      buildClickUpJobDescription(job),
      buildClickUpJobPayload(input).markdown_content,
      buildClickUpJobUpdatePayload(input).markdown_content,
      buildClickUpOwnedFieldsPayload(input).markdown_content,
    ];
    for (const description of descriptions) {
      expect(description).not.toContain("Open full brief & private attachments");
      expect(description).not.toContain("https://www.trushotmedia.com/autopacific");
      expect(description).toContain("[Open delivered files](https://files.example.com/spring-launch)");
      expect(description).toContain(job.id);
    }
  });
});
