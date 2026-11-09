import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

type Secret = { ciphertext: string; iv: string; tag: string };
function key() {
  const configured = process.env.OUTLOOK_CALENDAR_ENCRYPTION_KEY ?? "";
  if (!/^[a-f\d]{64}$/i.test(configured)) throw new Error("Outlook calendar connections are not configured yet.");
  return Buffer.from(configured, "hex");
}
export function encryptFeedUrl(url: string): Secret {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from("trushot:outlook-feed:v1"));
  return { ciphertext: Buffer.concat([cipher.update(url, "utf8"), cipher.final()]).toString("base64"), iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64") };
}
export function decryptFeedUrl(secret: Secret) {
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(secret.iv, "base64"));
  decipher.setAAD(Buffer.from("trushot:outlook-feed:v1"));
  decipher.setAuthTag(Buffer.from(secret.tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(secret.ciphertext, "base64")), decipher.final()]).toString("utf8");
}
