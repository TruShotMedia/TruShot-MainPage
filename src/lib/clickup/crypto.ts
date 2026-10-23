import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { getClickUpWebhookEncryptionKey } from "@/lib/clickup/config";

type EncryptedSecret = {
  ciphertext: string;
  iv: string;
  tag: string;
};

function encryptionKey() {
  const configured = getClickUpWebhookEncryptionKey();
  if (!configured) {
    throw new Error("Add CLICKUP_WEBHOOK_ENCRYPTION_KEY to Vercel before registering inbound ClickUp syncing.");
  }
  return createHash("sha256").update(configured, "utf8").digest();
}

export function encryptClickUpWebhookSecret(secret: string): EncryptedSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptClickUpWebhookSecret(value: EncryptedSecret) {
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(value.iv, "base64"));
  decipher.setAuthTag(Buffer.from(value.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(value.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
