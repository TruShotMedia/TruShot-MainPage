import { randomUUID } from "node:crypto";

type ClaimClickUpImportOptions = {
  createJobId?: () => string;
  findWinningJobId: () => Promise<string | null>;
  insertClaim: (jobId: string) => Promise<unknown | null>;
};

export async function claimClickUpImport({
  createJobId = randomUUID,
  findWinningJobId,
  insertClaim,
}: ClaimClickUpImportOptions) {
  const jobId = createJobId();
  const claimError = await insertClaim(jobId);
  if (!claimError) return { jobId, won: true } as const;

  const winningJobId = await findWinningJobId();
  if (winningJobId) return { jobId: winningJobId, won: false } as const;

  throw claimError;
}
