import { chmod, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const tokenFile = process.argv[2];
if (!tokenFile) {
  console.error("Usage: node tools/configure-device-secret.mjs /path/to/token-file");
  process.exit(1);
}

const token = (await readFile(resolve(tokenFile), "utf8")).trim();
if (!/^[a-f0-9]{64}$/i.test(token)) {
  console.error("The token file must contain exactly one 64-character hexadecimal token.");
  process.exit(1);
}

const destination = new URL("../src/DeviceConfig.local.h", import.meta.url);
await writeFile(destination, `#pragma once\n#define TRUSHOT_DEVICE_TOKEN "${token}"\n`, { mode: 0o600 });
await chmod(destination, 0o600);
console.log("Configured the local device credential. The generated header is excluded from Git.");
