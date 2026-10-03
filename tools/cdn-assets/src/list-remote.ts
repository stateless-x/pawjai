// Read-only: recursively list a storage directory (default WebAssets/) and
// print every file with its size, marking files the manifest does not cover.
//   bun --env-file=<env> src/list-remote.ts [dir/]
import { ASSETS } from "./manifest";

const zone = process.env.BUNNY_STORAGE_ZONE_NAME;
const key = process.env.BUNNY_STORAGE_ACCESS_KEY;
if (!zone || !key) {
  console.error("missing env (values not printed)");
  process.exit(2);
}
const root = process.argv[2] ?? "WebAssets/";
const covered = new Set(ASSETS.flatMap((a) => [a.to, ...(a.from ? [decodeURIComponent(a.from)] : []), ...(a.alsoAt ?? [])]));

type Obj = { ObjectName: string; Path: string; IsDirectory: boolean; Length: number };
async function walk(dir: string): Promise<{ path: string; bytes: number }[]> {
  const res = await fetch(`https://sg.storage.bunnycdn.com/${zone}/${dir.split("/").map(encodeURIComponent).join("/")}`, {
    headers: { AccessKey: key! },
  });
  if (!res.ok) throw new Error(`list ${dir}: ${res.status}`);
  const out: { path: string; bytes: number }[] = [];
  for (const o of (await res.json()) as Obj[]) {
    const p = `${dir}${o.ObjectName}`;
    if (o.IsDirectory) out.push(...(await walk(`${p}/`)));
    else out.push({ path: p, bytes: o.Length });
  }
  return out;
}

const files = await walk(root);
let uncovered = 0;
for (const f of files.sort((a, b) => a.path.localeCompare(b.path))) {
  const mark = covered.has(f.path) ? "  " : "??";
  if (mark === "??") uncovered++;
  console.log(`${mark} ${String(Math.round(f.bytes / 1024)).padStart(7)} KB  ${f.path}`);
}
console.log(`${files.length} files under ${root}, ${uncovered} not in manifest (??)`);
