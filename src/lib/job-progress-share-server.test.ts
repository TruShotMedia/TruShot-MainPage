import { createClient } from "@supabase/supabase-js";
import { expect, it, vi } from "vitest";
import { readClientJobProgressSnapshot, signProgressAttachment } from "./job-progress-share-server";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/data/admin", () => ({ getProductionContext: vi.fn() }));

const job = "11111111-0000-4000-8000-000000000001";
const workspace = "22222222-0000-4000-8000-000000000001";
const attachment = "33333333-0000-4000-8000-000000000001";
const storagePath = `${workspace}/${job}/44444444-0000-4000-8000-000000000001.pdf`;

function fixture(shared = true) {
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const filters = url.searchParams;
    if (url.pathname.endsWith("/website-jobs")) return Response.json([{
      title: "Sample job", workspace_id: workspace, delivery_url: "https://example.com/delivery",
      status: null, description: "Not client-facing",
    }]);
    if (url.pathname.endsWith("/website-job-tasks")) return Response.json([]);
    if (url.pathname.endsWith("/website-job-attachments")) {
      expect(filters.get("shared_on_progress")).toBe("eq.true");
      expect(filters.get("job_id")).toBe(`eq.${job}`);
      expect(filters.get("archived_at")).toBe("is.null");
      const file = { file_name: "Final brief.pdf", mime_type: "application/pdf" };
      if (filters.has("id")) {
        expect(filters.get("id")).toBe(`eq.${attachment}`);
        expect(filters.get("job.archived_at")).toBe("is.null");
        return Response.json(shared ? [{ ...file, storage_path: storagePath }] : []);
      }
      expect(filters.get("workspace_id")).toBe(`eq.${workspace}`);
      expect(filters.get("select")).not.toContain("storage_path");
      return Response.json(shared ? [{ ...file, id: attachment, size_bytes: 35000 }] : []);
    }
    expect(url.pathname).toBe(`/storage/v1/object/sign/website-job-attachments/${storagePath}`);
    expect(JSON.parse(String(init?.body))).toEqual({ expiresIn: 60 });
    return Response.json({ signedURL: "/object/sign/test?token=short-lived" });
  });
  const client = createClient("https://storage.example", "fake-service-key", {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch },
  });
  return { client, fetch };
}

it("projects only delivery and shared file metadata, not internal job details or storage paths", async () => {
  const { client, fetch } = fixture();
  const snapshot = await readClientJobProgressSnapshot(client, job);
  expect(snapshot).toMatchObject({
    deliveryUrl: "https://example.com/delivery",
    attachments: [{ id: attachment, name: "Final brief.pdf", size: 35000, viewable: true }],
  });
  expect(JSON.stringify(snapshot)).not.toMatch(/storage_path|Not client-facing|short-lived/);
  expect(fetch).toHaveBeenCalledTimes(3);
});

it("does not sign files that were unshared or are outside the job", async () => {
  const { client, fetch } = fixture(false);
  expect(await signProgressAttachment(client, job, attachment, "download")).toBeNull();
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("signs short-lived preview and download links, preserving the download filename", async () => {
  const { client } = fixture();
  const view = await signProgressAttachment(client, job, attachment, "view");
  const download = await signProgressAttachment(client, job, attachment, "download");
  expect(new URL(view!).searchParams.has("download")).toBe(false);
  expect(new URL(download!).searchParams.get("download")).toBe("Final brief.pdf");
});
