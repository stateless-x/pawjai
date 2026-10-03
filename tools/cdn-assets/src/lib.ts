import { existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { ASSETS, type Asset, type SizeClass } from "./manifest";

export const TOOL_ROOT = resolve(import.meta.dir, "..");
export const MONOREPO_ROOT = resolve(TOOL_ROOT, "../..");
export const LEGACY_CACHE = join(TOOL_ROOT, ".cache/legacy");
export const SOURCE_DIR = join(TOOL_ROOT, "source");
export const OUT_DIR = join(TOOL_ROOT, "out");
export const REFERER = "https://pawjai.co/";

/** Longest-edge cap per size class; `null` keeps the source dimensions. */
export const SIZE_RULES: Record<SizeClass, { max: number | null; quality: number }> = {
  icon: { max: 288, quality: 80 },
  iconLg: { max: 512, quality: 80 },
  avatar: { max: 384, quality: 85 },
  art: { max: 1024, quality: 80 },
  cover: { max: 1280, quality: 80 },
  small: { max: null, quality: 85 },
  svgRaster: { max: null, quality: 85 },
  banner: { max: 1600, quality: 82 },
  bannerWide: { max: 2432, quality: 82 },
  logo: { max: 768, quality: 85 },
  copy: { max: null, quality: 0 },
};

export const legacyCachePath = (from: string) => join(LEGACY_CACHE, decodeURIComponent(from));

const stem = (to: string) => to.replace(/\.[a-z0-9]+$/i, "");

/** Owner-supplied art in source/ wins over everything else. */
export function ownerSourceFor(asset: Asset): string | null {
  const s = join(SOURCE_DIR, stem(asset.to));
  const dir = dirname(s);
  if (!existsSync(dir)) return null;
  const base = s.slice(dir.length + 1);
  const hit = readdirSync(dir).find((f) => stem(f) === base);
  return hit ? join(dir, hit) : null;
}

export type ResolvedSource =
  | { kind: "owner" | "legacy" | "file"; path: string }
  | { kind: "placeholder" };

export function resolveSource(asset: Asset): ResolvedSource {
  const owner = ownerSourceFor(asset);
  if (owner) return { kind: "owner", path: owner };
  if (asset.file) return { kind: "file", path: join(MONOREPO_ROOT, asset.file) };
  if (asset.from) return { kind: "legacy", path: legacyCachePath(asset.from) };
  if (asset.placeholder) return { kind: "placeholder" };
  throw new Error(`asset ${asset.to} has no source`);
}

/** Every storage path the build writes, with the asset that produces it. */
export function outputTargets(): { path: string; asset: Asset }[] {
  return ASSETS.flatMap((a) => [a.to, ...(a.alsoAt ?? [])].map((path) => ({ path, asset: a })));
}

export function assertManifest(): void {
  const seen = new Map<string, string>();
  const keys = new Set<string>();
  for (const a of ASSETS) {
    for (const p of [a.to, ...(a.alsoAt ?? [])]) {
      if (seen.has(p)) throw new Error(`duplicate storage path ${p}`);
      seen.set(p, a.to);
    }
    if (!/^static\/[a-z0-9/-]+\.(webp|svg|webm)$/.test(a.to)) throw new Error(`bad path ${a.to}: lowercase kebab under static/ only`);
    for (const k of a.keys ?? []) {
      if (keys.has(k)) throw new Error(`duplicate key ${k}`);
      keys.add(k);
    }
  }
}
