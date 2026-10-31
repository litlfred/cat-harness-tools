#!/usr/bin/env bun
/**
 * Report, and optionally fix, what makes a BPMN diagram hard to read at 100%:
 * too wide or too tall, labels on labels, flows or boxes, crossing flows, and a
 * lane order that sends flows across lanes they do not stop in.
 *
 * Owner, 2026-10-31: *"bpmn detangle skill including swap lanes"*, *"add as QA
 * and author check"*. The criteria and the budget are
 * `src/workflow/diagram-fit.ts`; the procedure is the `bpmn-detangle` skill.
 *
 * Usage:
 *   bun run cat bpmn:detangle <file.bpmn|dir>...           # report
 *   bun run cat bpmn:detangle <file.bpmn> --write          # also apply the best lane order
 *   bun run cat bpmn:detangle <file.bpmn|dir>... --check   # exit 1 on any finding
 *   bun run cat bpmn:detangle <file.bpmn|dir>... --di-only # skip the browser
 *
 * Labels are checked where bpmn-js DRAWS them, so the browser is used when it
 * is there: a diagram with no `BPMNLabel` bounds leaves label placement to
 * bpmn-js, and only the drawing says whether "Satisfied with changes?" lands
 * on "No". Without a browser, or with `--di-only`, only labels the file
 * places itself are checked, and the report says so.
 *
 * `--write` makes boxes big enough for their text (wider, then taller,
 * growing the lane), changes the lane order (re-routing the flows between lanes as
 * elbows) and re-routes slanted flows at right angles (owner, 2026-10-31:
 * *"straight angled arrows ugly"*). Moving steps and labels is the author's
 * judgement, so it is reported, never guessed. Re-render and look.
 *
 * @module scripts/bpmn-detangle
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { applyLaneOrder, bestLaneOrder, crossings, diagramFit, headerOverflow, laneOrder, readDi, resizeShapes, straightenFlows, textOverflow, type DrawnLabels } from "../src/workflow/diagram-fit.ts";

type Draw = (xml: string) => Promise<DrawnLabels | undefined>;

/** bpmn-js in Chromium, through bootstrap-tools' renderer, or undefined when either is missing. */
async function openDraw(): Promise<{ draw: Draw; close: () => Promise<void> } | undefined> {
  try {
    const mod = await import("@litlfred/bootstrap-tools/scripts/render-bpmn.ts");
    const viewer = Bun.resolveSync("bpmn-js/dist/bpmn-viewer.production.min.js", import.meta.dir);
    const r = await mod.openRenderer(viewer);
    return {
      // A renderer from before bootstrap-tools drew labels at TEXT_STYLE returns no layout.
      draw: async (xml) => ((await r.render(xml)) as { layout?: DrawnLabels }).layout,
      close: () => r.close(),
    };
  } catch (e) {
    console.error(`· no browser renderer (${(e instanceof Error ? e.message : String(e)).split("\n")[0]}): labels checked from DI bounds only`);
    return undefined;
  }
}

const args = process.argv.slice(2);
const write = args.includes("--write");
const check = args.includes("--check");
const paths = args.filter((a) => !a.startsWith("--"));
if (paths.length === 0) {
  console.error("usage: bpmn-detangle <file.bpmn|dir>... [--write] [--check]");
  process.exit(2);
}

function bpmnFiles(p: string): string[] {
  if (statSync(p).isFile()) return p.endsWith(".bpmn") ? [p] : [];
  return readdirSync(p).flatMap((f) => (f === "node_modules" || f.startsWith(".") ? [] : bpmnFiles(join(p, f))));
}

const renderer = args.includes("--di-only") ? undefined : await openDraw();
let total = 0;
for (const file of paths.flatMap(bpmnFiles).sort()) {
  let xml = readFileSync(file, "utf8");
  if (!/<(?:\w+:)?process\b/.test(xml)) continue;
  const shown = relative(process.cwd(), file);
  if (write) {
    const before = readDi(xml);
    const best = bestLaneOrder(before);
    if (best.cost < best.current) {
      const next = applyLaneOrder(xml, best.order);
      const was = crossings(before).length, now = crossings(readDi(next)).length;
      // A swap that shortens the lane trips but adds crossings is not a detangle.
      if (now <= was) {
        writeFileSync(file, next);
        xml = next;
        console.log(`✓ ${shown}: lanes reordered, lane crossings ${best.current} → ${best.cost}, flow crossings ${was} → ${now}`);
      } else {
        console.log(`· ${shown}: a lane swap would add flow crossings (${was} → ${now}); left as it is`);
      }
    }
  }
  if (write) {
    const { xml: next, fixed } = straightenFlows(xml);
    if (fixed.length > 0) {
      writeFileSync(file, next);
      xml = next;
      console.log(`✓ ${shown}: ${fixed.length} slanted flow(s) routed at right angles (${fixed.join(", ")})`);
    }
  }
  if (write && renderer) {
    // Text that spills out of its box: first widen it (wrapping fewer
    // lines), then measure again and make it tall enough.
    for (const pass of ["wider", "taller"] as const) {
      const over = textOverflow(readDi(xml), await renderer.draw(xml).catch(() => undefined));
      if (over.length === 0) break;
      const sizes = new Map(over.map((o) => [o.id, pass === "wider"
        ? { width: Math.max(o.box.width, Math.min(o.box.width + 40, 180)), height: o.box.height }
        : { width: o.box.width, height: Math.max(o.box.height, o.need.height) }]));
      xml = resizeShapes(xml, sizes);
      writeFileSync(file, xml);
      console.log(`✓ ${shown}: ${over.length} box(es) made ${pass} for their text (${over.map((o) => o.id).join(", ")})`);
    }
  }
  if (write && renderer) {
    // Pool and lane names that spill out of their header strip: grow the
    // lane (for a pool, its last lane) until the name fits.
    const over = headerOverflow(await renderer.draw(xml).catch(() => undefined));
    if (over.length > 0) {
      const di = readDi(xml);
      const order = laneOrder(di);
      const min = new Map<string, number>();
      for (const h of over) {
        if (di.lanes.has(h.id)) min.set(h.id, Math.max(min.get(h.id) ?? 0, h.need));
        else if (di.pools.has(h.id) && order.length > 0) {
          const last = order.at(-1)!;
          const lh = di.lanes.get(last)!.height;
          min.set(last, Math.max(min.get(last) ?? 0, lh + (h.need - h.room)));
        }
      }
      // A one-lane pool: the pool's own need and the lane's are the same lane.
      xml = resizeShapes(xml, new Map(), min);
      writeFileSync(file, xml);
      console.log(`✓ ${shown}: ${over.length} pool/lane name(s) given room (${over.map((h) => h.id).join(", ")})`);
    }
  }
  const drawn = renderer ? await renderer.draw(xml).catch(() => undefined) : undefined;
  const findings = Object.entries(diagramFit(xml, drawn)).filter(([, fs]) => fs.length > 0);
  const n = findings.reduce((s, [, fs]) => s + fs.length, 0);
  total += n;
  if (n === 0) {
    console.log(`✓ ${shown}`);
    continue;
  }
  console.log(`⚠ ${shown}: ${n} finding(s)`);
  for (const [k, fs] of findings) for (const f of fs) console.log(`    ${k}  ${f.where}  ${f.detail}`);
}
await renderer?.close();
if (check && total > 0) process.exit(1);
