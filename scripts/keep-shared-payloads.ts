#!/usr/bin/env bun
/**
 * keep-shared-payloads — a main deploy keeps a content-addressed payload blob
 * it drops while a preview that may borrow it still stands.
 *
 * @module scripts/keep-shared-payloads
 * @covers none — a PUBLISHER step: it copies blobs from the branch being
 * replaced into the site about to be published; it judges no graph
 *
 * ```sh
 * bun run cat-harness-tools/scripts/keep-shared-payloads.ts --site _site --pages pages
 * ```
 *
 * ## Why
 *
 * Since `staging-share.ts` a preview stores only what differs from the live
 * site and borrows the rest. A main deploy is a FULL REPLACE
 * (`publish-gh-pages.sh`), and payloads under `payload/sha256/` are named by
 * their hash, so a blob the new build no longer writes is simply gone. A
 * preview staged before that deploy, which borrowed the blob, then gets a 404
 * for it. Keeping a copy in every preview would break the owner's ruling
 * (2026-10-31, "link to main asset so no file content duplication"), so main
 * keeps the dropped blob instead, for as long as an older sharing preview
 * stands (bean fwtz, Q-S2-2).
 *
 * ## The rule
 *
 * `payload/retained.json` maps each kept blob's path to when main first
 * dropped it. A blob stays while some preview under `STAGING/` has a
 * `shared.json` (it borrows) and a `.staged-at` earlier than that time (it
 * was staged while main still wrote the blob). A preview with no `.staged-at`
 * counts as older: keeping a blob too long costs bytes, dropping it too soon
 * costs a broken page. `staging-share.ts` never lets a preview borrow a
 * retained blob, so a newer preview never depends on one.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/** Where content-addressed payloads live, relative to the site root. */
export const PAYLOAD_DIR = "payload/sha256";
/** The record of blobs main keeps for older previews, relative to the site root. */
export const RETAINED_FILE = "payload/retained.json";

export interface Retained {
  version: 1;
  /** Blob path (site-relative) → ISO time main first dropped it. */
  kept: Record<string, string>;
}

/** The blob paths under `payload/sha256/` in `root`, site-relative. */
export function payloadFiles(root: string): Set<string> {
  const dir = join(root, PAYLOAD_DIR);
  const out = new Set<string>();
  if (!existsSync(dir)) return out;
  const walk = (d: string, rel: string): void => {
    for (const n of readdirSync(d)) {
      const full = join(d, n);
      const r = `${rel}/${n}`;
      if (statSync(full).isDirectory()) walk(full, r);
      else out.add(r);
    }
  };
  walk(dir, PAYLOAD_DIR);
  return out;
}

/** The retained record at `root`, or an empty one. */
export function readRetained(root: string): Retained {
  try {
    const r = JSON.parse(readFileSync(join(root, RETAINED_FILE), "utf-8")) as Retained;
    if (r && r.version === 1 && r.kept && typeof r.kept === "object") return r;
  } catch {
    // none yet
  }
  return { version: 1, kept: {} };
}

/** When each preview under `site/STAGING/` that borrows from the live site was staged (`undefined`: not known). */
export function sharingPreviews(site: string): (number | undefined)[] {
  const staging = join(site, "STAGING");
  if (!existsSync(staging)) return [];
  const out: (number | undefined)[] = [];
  for (const slug of readdirSync(staging)) {
    const dir = join(staging, slug);
    if (slug.startsWith("_") || !statSync(dir).isDirectory() || !existsSync(join(dir, "shared.json"))) continue;
    let at: number | undefined;
    try {
      const t = Date.parse(readFileSync(join(dir, ".staged-at"), "utf-8").trim());
      at = Number.isNaN(t) ? undefined : t;
    } catch {
      at = undefined;
    }
    out.push(at);
  }
  return out;
}

/**
 * Which dropped blobs to keep, and since when. `before`: the blobs on the
 * branch being replaced; `after`: the blobs the new build writes; `prior`: the
 * record on that branch; `previews`: each sharing preview's staging time.
 */
export function planKeep(before: ReadonlySet<string>, after: ReadonlySet<string>, prior: Retained, previews: readonly (number | undefined)[], now: string): Retained {
  const kept: Record<string, string> = {};
  for (const p of [...before].sort()) {
    if (after.has(p)) continue;
    const since = prior.kept[p] ?? now;
    const cut = Date.parse(since);
    if (previews.some((at) => at === undefined || at < cut)) kept[p] = since;
  }
  return { version: 1, kept };
}

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

if (import.meta.main) {
  const site = flag("site");
  const pages = flag("pages");
  if (!site || !pages) {
    console.error("usage: keep-shared-payloads.ts --site <site about to publish> --pages <gh-pages checkout being replaced>");
    process.exit(2);
  }
  const before = payloadFiles(pages);
  const after = payloadFiles(site);
  const plan = planKeep(before, after, readRetained(pages), sharingPreviews(site), new Date().toISOString());
  const paths = Object.keys(plan.kept);
  for (const p of paths) {
    mkdirSync(dirname(join(site, p)), { recursive: true });
    copyFileSync(join(pages, p), join(site, p));
  }
  if (paths.length || existsSync(join(pages, RETAINED_FILE))) {
    mkdirSync(dirname(join(site, RETAINED_FILE)), { recursive: true });
    writeFileSync(join(site, RETAINED_FILE), `${JSON.stringify(plan, null, 1)}\n`);
  }
  const dropped = [...before].filter((p) => !after.has(p)).length;
  console.log(`keep-shared-payloads: ${dropped} payload file(s) dropped by this build; ${paths.length} kept for older previews`);
}
