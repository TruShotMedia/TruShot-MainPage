import { afterEach, expect, it, vi } from "vitest";
import { decryptFeedUrl, encryptFeedUrl } from "./crypto";
afterEach(() => vi.unstubAllEnvs());
it("encrypts each URL with a fresh authenticated nonce", () => {
  vi.stubEnv("OUTLOOK_CALENDAR_ENCRYPTION_KEY", "ab".repeat(32));
  const url = "https://outlook.office365.com/owa/calendar/private-secret/calendar.ics";
  const encrypted = encryptFeedUrl(url);
  expect(JSON.stringify(encrypted)).not.toContain("private-secret");
  expect(decryptFeedUrl(encrypted)).toBe(url);
  expect(encryptFeedUrl(url)).not.toEqual(encrypted);
  expect(() => decryptFeedUrl({ ...encrypted, tag: Buffer.alloc(16).toString("base64") })).toThrow();
});
it("fails closed without a dedicated server encryption key", () => {
  vi.stubEnv("OUTLOOK_CALENDAR_ENCRYPTION_KEY", "");
  expect(() => encryptFeedUrl("secret")).toThrow("not configured");
});
