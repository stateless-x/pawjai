// Builds out/<storage path> for every manifest entry and writes
// out/build-report.json. Pure local step: no network, no Bunny writes.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import sharp from "sharp";
import { ASSETS, type Asset } from "./manifest";
import { assertManifest, OUT_DIR, resolveSource, SIZE_RULES } from "./lib";
import { placeholderSvg } from "./placeholder";

export interface ReportRow {
  to: string;
  alsoAt: string[];
  source: string;
  sourceBytes: number;
  bytes: number;
  width?: number;
  height?: number;
  placeholder: boolean;
}

async function render(asset: Asset): Promise<{ buf: Buffer; row: Omit<ReportRow, "to" | "alsoAt"> }> {
  const rule = SIZE_RULES[asset.size];
  const src = resolveSource(asset);

  if (src.kind === "placeholder") {
    const size = rule.max ?? 512;
    const buf = await sharp(placeholderSvg(size)).webp({ quality: 85, effort: 6 }).toBuffer();
    return { buf, row: { source: "placeholder", sourceBytes: 0, bytes: buf.length, width: size, height: size, placeholder: true } };
  }

  if (!existsSync(src.path)) throw new Error(`missing source for ${asset.to}: ${src.path} (run pull-legacy)`);
  const input = readFileSync(src.path);
  const base = { source: `${src.kind}:${src.path.split("/cdn-assets/").pop()}`, sourceBytes: input.length, placeholder: false };

  if (asset.size === "copy") {
    if (extname(src.path).toLowerCase() !== extname(asset.to)) throw new Error(`copy class needs same extension: ${asset.to}`);
    return { buf: input, row: { ...base, bytes: input.length } };
  }

  if (asset.size === "audio") {
    // MP3 decodes everywhere decodeAudioData runs (incl. Safari). -vn drops
    // embedded cover art; -map_metadata -1 strips tags.
    // Write to a file, not a pipe: ffmpeg can only add the Xing/LAME header
    // (accurate duration, gapless trim) to a seekable output.
    const tmp = join(tmpdir(), `cdn-assets-${process.pid}.mp3`);
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", src.path, "-vn", "-map_metadata", "-1", "-codec:a", "libmp3lame", "-q:a", "4", tmp]);
    const out = readFileSync(tmp);
    rmSync(tmp);
    return { buf: out, row: { ...base, bytes: out.length } };
  }

  // Raster-in-SVG wrappers render at 3x their viewBox; everything else decodes directly.
  let img = asset.size === "svgRaster" ? sharp(input, { density: 72 * 3 }) : sharp(input);
  if (rule.max) img = img.resize(rule.max, rule.max, { fit: "inside", withoutEnlargement: true });
  const { data, info } = await img.webp({ quality: rule.quality, effort: 6, alphaQuality: 90 }).toBuffer({ resolveWithObject: true });
  return { buf: data, row: { ...base, bytes: data.length, width: info.width, height: info.height } };
}

assertManifest();
rmSync(OUT_DIR, { recursive: true, force: true });
const report: ReportRow[] = [];
for (const asset of ASSETS) {
  const { buf, row } = await render(asset);
  for (const p of [asset.to, ...(asset.alsoAt ?? [])]) {
    const dest = join(OUT_DIR, p);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, buf);
  }
  report.push({ to: asset.to, alsoAt: asset.alsoAt ?? [], ...row });
}
writeFileSync(join(OUT_DIR, "build-report.json"), JSON.stringify(report, null, 2));

const before = report.reduce((n, r) => n + r.sourceBytes, 0);
const after = report.reduce((n, r) => n + r.bytes, 0);
const ph = report.filter((r) => r.placeholder).length;
console.log(`built ${report.length} assets (${ph} placeholders): ${(before / 1048576).toFixed(1)} MB -> ${(after / 1048576).toFixed(2)} MB`);
const big = report.filter((r) => r.bytes > 150 * 1024);
if (big.length) console.log(`over 150 KB:\n  ${big.map((r) => `${r.to} ${Math.round(r.bytes / 1024)} KB`).join("\n  ")}`);
