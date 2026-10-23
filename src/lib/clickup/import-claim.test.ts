import { describe, expect, it } from "vitest";
import { claimClickUpImport } from "@/lib/clickup/import-claim";

describe("ClickUp inbound import claims", () => {
  it("allows only one concurrent delivery to claim a remote task", async () => {
    let winningJobId: string | null = null;
    let nextId = 0;
    const insertClaim = async (jobId: string) => {
      await Promise.resolve();
      if (winningJobId) return new Error("duplicate task claim");
      winningJobId = jobId;
      return null;
    };
    const findWinningJobId = async () => winningJobId;

    const results = await Promise.all([
      claimClickUpImport({ createJobId: () => `job-${++nextId}`, findWinningJobId, insertClaim }),
      claimClickUpImport({ createJobId: () => `job-${++nextId}`, findWinningJobId, insertClaim }),
    ]);

    expect(results.filter((result) => result.won)).toHaveLength(1);
    expect(results.filter((result) => !result.won)).toHaveLength(1);
    expect(results.every((result) => result.jobId === winningJobId)).toBe(true);
  });

  it("surfaces a claim failure when no competing import won", async () => {
    const error = new Error("database unavailable");

    await expect(
      claimClickUpImport({
        createJobId: () => "job-1",
        findWinningJobId: async () => null,
        insertClaim: async () => error,
      }),
    ).rejects.toBe(error);
  });
});
