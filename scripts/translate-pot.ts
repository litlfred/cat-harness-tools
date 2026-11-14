#!/usr/bin/env bun
/**
 * Fill the EMPTY entries of a layer's gettext catalogues with an open,
 * self-hosted machine translator, marked `#, fuzzy`.
 *
 * @module scripts/translate-pot
 * @covers translation-sources
 *
 *   bun run cat-harness-tools/scripts/translate-pot.ts --root <layer root> \
 *     --engine libretranslate --url http://localhost:5000
 *   bun run cat-harness-tools/scripts/translate-pot.ts --root <layer root> \
 *     --engine opus-mt --runner "python3 /path/to/opus_mt_runner.py"
 *
 * Options: `--locale es,fr` (default: every locale directory) · `--only
 * <catalogue>` (e.g. `start/contributing`) · `--batch <n>` strings per engine
 * call (default 16) · `--model <id>` to override the recorded model ·
 * `--no-create-node` to skip a catalogue with no translation node instead of
 * writing one · `--dry-run` to translate and report without writing.
 *
 * For each `<locale>/<name>.po` with a `<name>.pot` beside it, in the layer's
 * declared `translation-sources` directory, this fills only `msgstr ""`
 * entries, re-checks every placeholder, writes each string as `#, fuzzy`, and
 * records the engine on the catalogue's `translation-node/v1` node. The rules
 * are in `scripts/lib/machine-translation.ts`. A catalogue is NOT filled when
 * it says `DO NOT MACHINE-FILL`, or when its node is already official.
 *
 * A POT with no `.po` beside it is reported, not initialised: starting a
 * catalogue is a translator's decision (`msginit`), not this step's.
 *
 * Exit 0 something was filled (or would be, with `--dry-run`) · 3 nothing was
 * · 2 could not determine (no declaration, bad options) · 1 the engine failed.
 */
import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

import { instanceDirectories } from "../schemas/kg/cat-harness.js";
import { TranslationNodeSchema } from "../schemas/content/translation.ts";
import { poEntries } from "./lib/translation-adjudication.ts";
import {
  applyTranslations,
  fillCandidates,
  forbidsMachineFill,
  generatorOf,
  libreTranslateEngine,
  machineNodeStatus,
  opusMtEngine,
  splitWhitespace,
  type CommandRunner,
  type MtEngine,
  type Skipped,
} from "./lib/machine-translation.ts";

const SOURCE_LOCALE = "en";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const runCommand: CommandRunner = (argv, stdin) =>
  new Promise((ok, fail) => {
    const p = spawn(argv[0]!, argv.slice(1), { stdio: ["pipe", "pipe", "inherit"] });
    let out = "";
    p.stdout.on("data", (d: Buffer) => (out += d.toString("utf-8")));
    p.on("error", fail);
    p.on("close", (code) => (code === 0 ? ok(out) : fail(new Error(`runner exited ${code}`))));
    p.stdin.end(stdin);
  });

/** Every `.po` under a locale directory, as its path without extension, relative to it. */
function catalogues(localeDir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const n of readdirSync(d).sort()) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p);
      else if (n.endsWith(".po")) out.push(relative(localeDir, p).slice(0, -3).split(sep).join("/"));
    }
  };
  walk(localeDir);
  return out;
}

/** The first `#:` source file of a template, line number dropped. */
function firstSource(pot: string): string | undefined {
  for (const e of poEntries(pot)) for (const r of e.references) return r.replace(/:\d+$/, "");
  return undefined;
}

export interface CatalogueReport {
  catalogue: string;
  locale: string;
  filled: number;
  skipped: Skipped[];
  /** Why the whole catalogue was not filled. */
  refused?: string;
  nodeCreated?: boolean;
}

export interface RunOptions {
  root: string;
  /** The `translation-sources` directory, relative to `root`. */
  translations: string;
  engine: MtEngine;
  locales?: string[];
  only?: string;
  batch?: number;
  createNode?: boolean;
  dryRun?: boolean;
  now?: () => Date;
  log?: (s: string) => void;
}

/** Fill every catalogue pair under `translations`. Exported for the tests. */
export async function translateLayer(o: RunOptions): Promise<{ reports: CatalogueReport[]; potOnly: string[] }> {
  const tdir = join(o.root, o.translations);
  const log = o.log ?? (() => {});
  const reports: CatalogueReport[] = [];
  const potOnly: string[] = [];
  const locales = (o.locales ?? readdirSync(tdir).filter((n) => statSync(join(tdir, n)).isDirectory()).sort())
    .filter((l) => l !== SOURCE_LOCALE);
  for (const locale of locales) {
    const ldir = join(tdir, locale);
    if (!existsSync(ldir)) continue;
    // POTs with no .po beside them: reported, never initialised.
    const walkPot = (d: string) => {
      for (const n of readdirSync(d).sort()) {
        const p = join(d, n);
        if (statSync(p).isDirectory()) walkPot(p);
        else if (n.endsWith(".pot") && !existsSync(p.slice(0, -1))) potOnly.push(`${locale}/${relative(ldir, p).split(sep).join("/")}`);
      }
    };
    walkPot(ldir);
    for (const catalogue of catalogues(ldir)) {
      if (o.only !== undefined && catalogue !== o.only) continue;
      const poPath = join(ldir, `${catalogue}.po`);
      const potPath = join(ldir, `${catalogue}.pot`);
      if (!existsSync(potPath)) continue; // a hand-authored catalogue (a glossary): no template, not a pair
      const report: CatalogueReport = { catalogue, locale, filled: 0, skipped: [] };
      reports.push(report);
      const po = readFileSync(poPath, "utf-8");
      if (forbidsMachineFill(po)) {
        report.refused = "the catalogue says DO NOT MACHINE-FILL";
        continue;
      }
      const nodePath = join(ldir, `${catalogue}.json`);
      let node: Record<string, unknown> | undefined;
      if (existsSync(nodePath)) {
        const raw = JSON.parse(readFileSync(nodePath, "utf-8")) as Record<string, unknown>;
        const parsed = TranslationNodeSchema.safeParse(raw);
        if (!parsed.success) {
          report.refused = `its node does not validate as translation-node/v1: ${parsed.error.issues[0]?.message ?? "invalid"}`;
          continue;
        }
        if ((raw.status as Record<string, unknown>).official === true) {
          report.refused = "its node is official; machine text is not added to a signed-off catalogue";
          continue;
        }
        node = raw;
      } else if (o.createNode === false) {
        report.refused = "no translation node beside it (--no-create-node)";
        continue;
      }

      const { candidates, skipped } = fillCandidates(po);
      report.skipped.push(...skipped);
      if (candidates.length === 0) continue;

      const translated: string[] = [];
      const size = Math.max(1, o.batch ?? 16);
      for (let i = 0; i < candidates.length; i += size) {
        const cores = candidates.slice(i, i + size).map((c) => splitWhitespace(c.msgid).core);
        const out = await o.engine.translate(cores, SOURCE_LOCALE, locale);
        if (out.length !== cores.length) throw new Error(`${o.engine.name}: ${out.length} strings back for ${cores.length} sent`);
        translated.push(...out);
      }
      const applied = applyTranslations(po, candidates, translated);
      report.filled = applied.filled;
      report.skipped.push(...applied.skipped);
      if (applied.filled === 0) continue;

      const generator = generatorOf(o.engine, locale);
      const generatedAt = (o.now ?? (() => new Date()))().toISOString();
      const rel = (p: string) => relative(o.root, p).split(sep).join("/");
      const nextNode: Record<string, unknown> = node
        ? { ...node, status: machineNodeStatus(node.status as Record<string, unknown>, generator, generatedAt) }
        : {
            $schema: "translation-node/v1",
            label: `trans:${locale}/${catalogue}`,
            locale,
            sourceFile: firstSource(readFileSync(potPath, "utf-8")) ?? rel(potPath),
            potFile: rel(potPath),
            poFile: rel(poPath),
            status: machineNodeStatus({ locale, official: false }, generator, generatedAt),
          };
      const check = TranslationNodeSchema.safeParse(nextNode);
      if (!check.success) {
        report.refused = `the updated node would not validate: ${check.error.issues[0]?.message ?? "invalid"}`;
        report.filled = 0;
        continue;
      }
      report.nodeCreated = node === undefined;
      if (!o.dryRun) {
        writeFileSync(poPath, applied.text);
        writeFileSync(nodePath, `${JSON.stringify(nextNode, null, 2)}\n`);
      }
      log(`  ${locale}/${catalogue}: ${applied.filled} filled (fuzzy)${report.nodeCreated ? ", node created" : ""}`);
    }
  }
  return { reports, potOnly };
}

async function main(): Promise<number> {
  const root = resolve(arg("--root") ?? ".");
  const tdir = instanceDirectories(root).find((d) => (d.graphTypologies ?? []).includes("translation-sources"));
  if (!tdir) {
    console.error(`translate-pot: ${root} declares no translation-sources directory. This is NOT a pass.`);
    return 2;
  }
  const engineName = arg("--engine");
  const model = arg("--model");
  let engine: MtEngine;
  try {
    if (engineName === "libretranslate") {
      engine = libreTranslateEngine(arg("--url") ?? "http://localhost:5000", fetch, model);
    } else if (engineName === "opus-mt") {
      const runner = arg("--runner");
      if (!runner) {
        console.error("translate-pot: --engine opus-mt needs --runner \"<command>\" (a local OPUS-MT runner).");
        return 2;
      }
      engine = opusMtEngine(runner.split(/\s+/).filter(Boolean), runCommand, model);
    } else {
      console.error("translate-pot: --engine must be opus-mt or libretranslate.");
      return 2;
    }
  } catch (e) {
    console.error(`translate-pot: ${(e as Error).message}`);
    return 2;
  }
  const dryRun = process.argv.includes("--dry-run");
  let result: Awaited<ReturnType<typeof translateLayer>>;
  try {
    result = await translateLayer({
      root,
      translations: tdir.path.replace(/\/+$/, ""),
      engine,
      ...(arg("--locale") ? { locales: arg("--locale")!.split(",").map((s) => s.trim()).filter(Boolean) } : {}),
      ...(arg("--only") ? { only: arg("--only")! } : {}),
      batch: Number(arg("--batch") ?? 16),
      createNode: !process.argv.includes("--no-create-node"),
      dryRun,
      log: (s) => console.log(s),
    });
  } catch (e) {
    console.error(`translate-pot: ${(e as Error).message}`);
    return 1;
  }
  const filled = result.reports.reduce((n, r) => n + r.filled, 0);
  const refused = result.reports.filter((r) => r.refused);
  const skipped = result.reports.flatMap((r) => r.skipped.map((s) => ({ ...s, where: `${r.locale}/${r.catalogue}` })));
  console.log(`\n${filled} string(s) ${dryRun ? "would be " : ""}filled as fuzzy in ${result.reports.filter((r) => r.filled > 0).length} catalogue(s).`);
  if (refused.length) {
    console.log(`\nNot filled (${refused.length} catalogue(s)):`);
    for (const r of refused) console.log(`  ${r.locale}/${r.catalogue}: ${r.refused}`);
  }
  if (skipped.length) {
    console.log(`\nLeft empty (${skipped.length} string(s)):`);
    for (const s of skipped) console.log(`  ${s.where} ${s.msgctxt ? `[${s.msgctxt}] ` : ""}${JSON.stringify(s.msgid.slice(0, 80))}: ${s.reason}`);
  }
  if (result.potOnly.length) console.log(`\n${result.potOnly.length} template(s) have no .po beside them and were not initialised.`);
  return filled > 0 ? 0 : 3;
}

if (import.meta.main) process.exit(await main());
