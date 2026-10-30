/**
 * cat-harness-tools' own Tool nodes — the `tools` graph of the implementation
 * layer.
 *
 * @module cat-harness-tools/tools
 * @graphNode tool
 *
 * Reached through tool auto-discovery ({@link ./discover.ts}, bean `p0za`),
 * never by an import, like every other instance's `tools` graph.
 *
 * ## Why a Tool node lives here and not in `cat-harness/tools/`
 *
 * A Tool whose `invoke.inProcess.module` is code in THIS layer is declared
 * here, beside that code (owner, 2026-10-14: "Move the node to tools"). Its
 * module path is then instance-relative to this layer, so it names no
 * directory above or beside the instance that declares it. Declared in
 * cat-harness, the same node had to spell `../cat-harness-tools/src/…`, which
 * `check:import-direction` reads, correctly, as cat-harness reaching a layer
 * its `needs` does not name.
 *
 * Tools invoked by shell (`bun run cat-harness-tools/scripts/…`) stay declared
 * in cat-harness: a command line is not a module path, and the `w2gr` split
 * (definitions there, implementations here) still holds for them.
 *
 * ## `bpmn-engine` — bean `folio-assistant-cy4p`
 *
 * Owner ruling 2026-10-10 ("both"): the engine other instances discover and
 * depend on, not an implementation detail of one MCP server. Its checklist
 * projection, `bpmn-checklist`, is invoked by shell and stays in cat-harness.
 *
 * ## One Tool per folder — bean `tdir`
 *
 * Each Tool is declared in `<id>/<id>.ts` beside this file, with its scripts
 * and tests when they are its alone; this file only loads the folders
 * (`toolsFromFolders`, which holds the folder = file = id convention).
 */
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { existsSync, readFileSync } from "node:fs";

import { declarationPathIn } from "../schemas/kg/cat-harness.js";
import type { ToolDefinition } from "../schemas/tools/tool.js";
import { toolsFromFolders } from "../schemas/tools/tool-folders.js";
import { HARNESS_ROOT } from "../scripts/lib/roots.ts";
import { hostSchemaBase } from "../scripts/lib/host-schema.ts";

/**
 * The base the I/O type IRIs are minted against when the caller names none:
 * the HARNESS's declared `canonicalUrl`, because the tool-type vocabulary is
 * the harness's and is published once, under its own directory at its base
 * (`hostSchemaBase`, #676) — the same answer `discover.ts` passes every
 * instance's `tools()`. An empty base would mint relative IRIs, which the
 * Tool schema refuses at load (measured standalone).
 */
function harnessBase(): string {
  const p = declarationPathIn(HARNESS_ROOT);
  if (p === undefined || !existsSync(p)) return "";
  try {
    return hostSchemaBase((JSON.parse(readFileSync(p, "utf-8")) as { canonicalUrl?: string }).canonicalUrl ?? "");
  } catch {
    return "";
  }
}

export function tools(baseUrl?: string): ToolDefinition[] {
  return toolsFromFolders(dirname(fileURLToPath(import.meta.url)), baseUrl ?? harnessBase());
}
