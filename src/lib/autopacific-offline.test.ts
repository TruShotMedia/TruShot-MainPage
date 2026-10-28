// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import {
  queueAutopacificOfflineMutation,
  readAutopacificOfflineQueue,
  removeAutopacificOfflineMutations,
} from "@/lib/autopacific-offline";

describe("AutoPacific field queue", () => {
  beforeEach(() => window.localStorage.clear());

  it("compacts repeated moves while preserving the first live revision guard", () => {
    const first = queueAutopacificOfflineMutation({
      entity: "job",
      expectedUpdatedAt: "2026-10-26T01:00:00.000Z",
      recordId: "11111111-1111-4111-8111-111111111111",
      statusId: "22222222-2222-4222-8222-222222222222",
      title: "Field shoot",
    });
    const second = queueAutopacificOfflineMutation({
      entity: "job",
      expectedUpdatedAt: "2026-10-26T01:05:00.000Z",
      recordId: "11111111-1111-4111-8111-111111111111",
      statusId: "33333333-3333-4333-8333-333333333333",
      title: "Field shoot",
    });

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(second[0]).toMatchObject({
      expectedUpdatedAt: "2026-10-26T01:00:00.000Z",
      statusId: "33333333-3333-4333-8333-333333333333",
    });
    expect(second[0]?.clientMutationId).toBe(first[0]?.clientMutationId);
  });

  it("removes only revisions acknowledged by the server", () => {
    const queue = queueAutopacificOfflineMutation({
      entity: "task",
      expectedUpdatedAt: "2026-10-26T01:00:00.000Z",
      recordId: "44444444-4444-4444-8444-444444444444",
      statusId: "55555555-5555-4555-8555-555555555555",
      title: "Edit reel",
    });

    removeAutopacificOfflineMutations([queue[0]!.clientMutationId]);
    expect(readAutopacificOfflineQueue()).toEqual([]);
  });
  it("keeps a newer offline move made while an older one was syncing", () => {
    const sent = queueAutopacificOfflineMutation({ entity: "task", expectedUpdatedAt: "2026-10-28T00:00:00Z", recordId: "task", statusId: "progress", title: "Clip" });
    queueAutopacificOfflineMutation({ ...sent[0], statusId: "review" });
    const remaining = removeAutopacificOfflineMutations([sent[0].clientMutationId], sent);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].statusId).toBe("review");
  });
});
