import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const originalKey = process.env.CLICKUP_WEBHOOK_ENCRYPTION_KEY;

beforeEach(() => {
  process.env.CLICKUP_WEBHOOK_ENCRYPTION_KEY = "test-only-secret-that-is-long-enough-for-the-suite";
});

afterEach(() => {
  if (originalKey === undefined) delete process.env.CLICKUP_WEBHOOK_ENCRYPTION_KEY;
  else process.env.CLICKUP_WEBHOOK_ENCRYPTION_KEY = originalKey;
});

describe("ClickUp webhook secret encryption", () => {
  it("round-trips a webhook signing secret without storing it as plaintext", async () => {
    const { decryptClickUpWebhookSecret, encryptClickUpWebhookSecret } = await import("@/lib/clickup/crypto");
    const encrypted = encryptClickUpWebhookSecret("clickup-signing-secret");
    expect(encrypted.ciphertext).not.toContain("clickup-signing-secret");
    expect(decryptClickUpWebhookSecret(encrypted)).toBe("clickup-signing-secret");
  });

  it("rejects ciphertext when the server encryption key changes", async () => {
    const { decryptClickUpWebhookSecret, encryptClickUpWebhookSecret } = await import("@/lib/clickup/crypto");
    const encrypted = encryptClickUpWebhookSecret("clickup-signing-secret");
    process.env.CLICKUP_WEBHOOK_ENCRYPTION_KEY = "a-different-test-only-server-secret";
    expect(() => decryptClickUpWebhookSecret(encrypted)).toThrow();
  });
});
