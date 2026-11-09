import { copyFile, mkdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

// MapLibre 6 uses a separate module worker. Serve the installed, pinned worker
// from this origin rather than relying on a bundler rewriting import.meta.url.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const pkg=JSON.parse(await readFile(path.join(root,"node_modules/maplibre-gl/package.json"),"utf8"));
if(!/^\d+\.\d+\.\d+$/.test(pkg.version)) throw new Error("Expected a pinned MapLibre release");
const target=path.join(root,"public/vendor/maplibre",pkg.version);
await mkdir(target,{recursive:true});
await copyFile(path.join(root,"node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs"),path.join(target,"worker.mjs"));
await copyFile(path.join(root,"node_modules/maplibre-gl/LICENSE.txt"),path.join(target,"LICENSE.txt"));
console.log(`Prepared MapLibre ${pkg.version} worker`);
