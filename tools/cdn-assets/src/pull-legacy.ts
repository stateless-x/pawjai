// Downloads every legacy `from` file into .cache/legacy so build.ts has
// sources. Bunny hotlink protection needs the site Referer.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { ASSETS, CDN_BASE_URL } from "./manifest";
import { legacyCachePath, REFERER } from "./lib";

let fetched = 0;
const failures: string[] = [];
for (const a of ASSETS) {
  if (!a.from) continue;
  const dest = legacyCachePath(a.from);
  if (existsSync(dest)) continue;
  const res = await fetch(`${CDN_BASE_URL}/${a.from}`, { headers: { Referer: REFERER } });
  if (!res.ok) {
    failures.push(`${res.status} ${a.from}`);
    continue;
  }
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  fetched++;
}
console.log(`fetched ${fetched} legacy files`);
if (failures.length) {
  console.error(`failed:\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
