import { chmod, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import webpush from "web-push";

const envPath = resolve(process.cwd(), ".env.local");
const source = await readFile(envPath, "utf8").catch(() => "");
const values = new Map();
for (const line of source.split(/\r?\n/)) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match) values.set(match[1], match[2]);
}

const existingPublicKey = values.get("NEXT_PUBLIC_VAPID_PUBLIC_KEY");
const existingPrivateKey = values.get("VAPID_PRIVATE_KEY");
const keys = existingPublicKey && existingPrivateKey
  ? { publicKey: existingPublicKey, privateKey: existingPrivateKey }
  : webpush.generateVAPIDKeys();

const requiredValues = new Map([
  ["NEXT_PUBLIC_VAPID_PUBLIC_KEY", keys.publicKey],
  ["VAPID_PRIVATE_KEY", keys.privateKey],
  ["VAPID_SUBJECT", values.get("VAPID_SUBJECT") || "mailto:info@fearlessau.com"],
]);

const seen = new Set();
const nextLines = source.split(/\r?\n/).filter((line, index, lines) => index < lines.length - 1 || line !== "").map((line) => {
  const match = line.match(/^([A-Z0-9_]+)=/);
  if (!match || !requiredValues.has(match[1])) return line;
  seen.add(match[1]);
  return `${match[1]}=${requiredValues.get(match[1])}`;
});
for (const [name, value] of requiredValues) {
  if (!seen.has(name)) nextLines.push(`${name}=${value}`);
}

await writeFile(envPath, `${nextLines.join("\n")}\n`, { mode: 0o600 });
await chmod(envPath, 0o600);
console.log("Push credentials are present in .env.local: NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT.");
