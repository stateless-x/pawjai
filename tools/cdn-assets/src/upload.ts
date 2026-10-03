// Uploads out/ to Bunny Storage. Dry run by default; pass --apply to write.
// Never deletes. Skips files whose stored SHA-256 already matches.
// Also stores each non-placeholder source under static/_source/ so the
// originals survive once legacy WebAssets/ paths are retired.
//
// Credentials are process input only (same env var names as pawjai-be):
//   bun --env-file=<path to env file> src/upload.ts [--apply]
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { CDN_HOST } from "./manifest";
import { OUT_DIR, outputTargets, resolveSource } from "./lib";

const STORAGE_HOST = "sg.storage.bunnycdn.com"; // matches pawjai-be src/utils/bunny.ts
const apply = process.argv.includes("--apply");

const zone = process.env.BUNNY_STORAGE_ZONE_NAME;
const key = process.env.BUNNY_STORAGE_ACCESS_KEY;
const pullHost = process.env.BUNNY_PULL_ZONE_HOSTNAME;
if (!zone || !key || !pullHost) {
  console.error(
    `missing env: zone=${Boolean(zone)} key=${Boolean(key)} pullHost=${Boolean(pullHost)} (values not printed)`,
  );
  process.exit(2);
}
if (pullHost !== CDN_HOST) {
  console.error(`refusing: env pull zone is not ${CDN_HOST}`);
  process.exit(2);
}

const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex").toUpperCase();
const storageUrl = (p: string) => `https://${STORAGE_HOST}/${zone}/${p.split("/").map(encodeURIComponent).join("/")}`;

const listings = new Map<string, Map<string, string>>();
async function remoteChecksum(path: string): Promise<string | null> {
  const dir = dirname(path);
  if (!listings.has(dir)) {
    const res = await fetch(`${storageUrl(dir)}/`, { headers: { AccessKey: key! } });
    const map = new Map<string, string>();
    if (res.ok) {
      for (const o of (await res.json()) as { ObjectName: string; Checksum: string | null; IsDirectory: boolean }[]) {
        if (!o.IsDirectory) map.set(o.ObjectName, (o.Checksum ?? "").toUpperCase());
      }
    } else if (res.status !== 404) {
      throw new Error(`list ${dir} failed: ${res.status}`);
    }
    listings.set(dir, map);
  }
  return listings.get(dir)!.get(path.slice(dir.length + 1)) ?? null;
}

interface Item { path: string; bytes: Buffer }
const items: Item[] = [];
const seenSources = new Set<string>();
for (const { path, asset } of outputTargets()) {
  items.push({ path, bytes: readFileSync(join(OUT_DIR, path)) });
  const src = resolveSource(asset);
  if (src.kind !== "placeholder" && path === asset.to && existsSync(src.path)) {
    const sourcePath = `static/_source/${asset.to.replace(/\.[a-z0-9]+$/i, "")}${extname(src.path).toLowerCase()}`;
    if (!seenSources.has(sourcePath)) {
      seenSources.add(sourcePath);
      items.push({ path: sourcePath, bytes: readFileSync(src.path) });
    }
  }
}

const plan = { create: [] as Item[], update: [] as Item[], same: 0 };
for (const it of items) {
  const remote = await remoteChecksum(it.path);
  if (remote === null) plan.create.push(it);
  else if (remote !== sha256(it.bytes)) plan.update.push(it);
  else plan.same++;
}

const mb = (xs: Item[]) => (xs.reduce((n, x) => n + x.bytes.length, 0) / 1048576).toFixed(2);
console.log(`create ${plan.create.length} (${mb(plan.create)} MB), update ${plan.update.length} (${mb(plan.update)} MB), unchanged ${plan.same}`);
for (const it of plan.update) console.log(`  update ${it.path}`);
const legacyWrites = [...plan.create, ...plan.update].filter((i) => !i.path.startsWith("static/"));
for (const it of legacyWrites) console.log(`  legacy path write ${it.path}`);

if (!apply) {
  console.log("dry run: pass --apply to write");
  process.exit(0);
}

let failed = 0;
for (const it of [...plan.create, ...plan.update]) {
  const res = await fetch(storageUrl(it.path), {
    method: "PUT",
    headers: { AccessKey: key, "Content-Type": "application/octet-stream", Checksum: sha256(it.bytes) },
    body: it.bytes,
  });
  if (!res.ok) {
    failed++;
    console.error(`PUT ${it.path} -> ${res.status}`);
  }
}
console.log(failed ? `${failed} uploads failed` : "all uploads done");

// Overwritten paths keep serving the old bytes from the edge until purged
// (Bunny does not purge on storage overwrite, and ignores query strings).
// Purging needs the ACCOUNT api key, not the storage key.
const toPurge = plan.update.map((i) => `https://${CDN_HOST}/${i.path}`);
if (toPurge.length) {
  const accountKey = process.env.BUNNY_ACCOUNT_API_KEY;
  if (!accountKey) {
    console.log(`purge these in the Bunny dashboard (or set BUNNY_ACCOUNT_API_KEY and rerun):\n  ${toPurge.join("\n  ")}`);
  } else {
    for (const url of toPurge) {
      const res = await fetch(`https://api.bunny.net/purge?url=${encodeURIComponent(url)}`, { method: "POST", headers: { AccessKey: accountKey } });
      console.log(`purge ${res.ok ? "ok    " : `FAILED ${res.status}`} ${url}`);
      if (!res.ok) failed++;
    }
  }
}
process.exit(failed ? 1 : 0);
