/**
 * The cat-harness instance's Tool nodes — its `tools` graph.
 *
 * Was cat-harness `tools/index.ts`. The harness holds no code (bean `8lcl`),
 * so its tools directory is folders of `<id>/<id>.json` and nothing else; this
 * is the loader those folders used to carry beside them. Discovery
 * (`tools/discover.ts`) loads a directory with no `index.ts` the same way.
 *
 * @graphNode none — a reader over the harness's Tool folders; the Tool node's schema is `tool.ts`
 * @module schemas/tools/harness-tools
 */
import { requireHarnessRoot } from "../harness-root.js";
import { directoriesForGraph } from "../kg/cat-harness.js";
import type { ToolDefinition } from "./tool.js";
import { toolsFromFolders } from "./tool-folders.js";
import { base } from "./tool-helpers.js";

/** Every declared `tools` directory of the harness, read through the declaration. */
export function tools(baseUrl?: string): ToolDefinition[] {
  const at = baseUrl ?? base();
  return directoriesForGraph(requireHarnessRoot(), "tools").flatMap((dir) => toolsFromFolders(dir, at));
}
