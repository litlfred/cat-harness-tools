/**
 * The ✍ suggest editor's profiles: the `folio-editor-checker/v1` nodes the
 * instances of a checkout declare (a directory of graph typology
 * `editor-checkers`), each bundled into one browser module the edit-links
 * runtime imports on first use (bean folio-assistant-4dx7).
 *
 *   const profiles = await bundleEditorProfiles(repoRoot, "paper", join(out, "assets", "suggest"), "../../assets/suggest/");
 *   // → [{ id, module, kinds?, rawLatexFirstFor? }], for `cfg.suggest.profiles`
 *
 * ## The contract with the runtime
 *
 * A node names its code as `path.ts#Export`, relative to its instance's root.
 * The bundle re-exports each under the ROLE the runtime calls, so the runtime
 * never learns an export name:
 *
 * | role | node field | the runtime calls |
 * |---|---|---|
 * | `check` | `check` | `check(before, after, { macros, kg })` → findings; an `error` blocks submit |
 * | `macros` | `macros` | `macros(katexMacros)` → the table passed to `check` and `remarkFirst` |
 * | `latexConfig` | `crepe.latexConfig` | `latexConfig(katexMacros)` → Crepe's latex feature config |
 * | `nodeViews` | `crepe.nodeViews` | `nodeViews[name](katex, katexMacros)` → a ProseMirror node view |
 * | `remarkFirst` | `crepe.remarkFirst` | `remarkFirst(macros)` → a `remarkPlugins` updater |
 * | `open` | `open` | a MODE: `open(host, ctx)` → `{ get(): string \| Promise<string>, dispose() }`, its own editor in place of Crepe |
 * | `issue` | `issue` | `issue(before, after, ctx)` → `{ title?, body?, template? }` for the issue a mode opens |
 *
 * A mode's `ctx` is `{ text, src, path, label, kind, repo, branch, config, status(msg) }`.
 * Its editor may live in another window (a form builder in a pop-up,
 * answering by `postMessage`): `get()` is awaited on submit and never polled,
 * and `dispose()` is where it closes that window. `extensions` lets a mode
 * serve a source that is not Markdown (`[".json"]`), and a host can name a
 * profile by id with `data-suggest-mode`.
 *
 * The node's schema is its declaring instance's (folio-assistant-sci
 * `schemas/editor-checker.ts`); it is read raw here, as `declared-nodes.ts`
 * reads declarations, because this layer may not import the one above it.
 * What is checked here is only what the bundle needs: a code ref that names a
 * file inside its instance.
 *
 * @module cat-harness-tools/pipeline/editor-profiles
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { instanceRootsIn } from "@litlfred/cat-harness/schemas/instance-roots.ts";
import { ownDeclaredDirectories } from "@litlfred/cat-harness/schemas/declared-nodes.ts";

export const EDITOR_CHECKER_SCHEMA = "folio-editor-checker/v1";
export const EDITOR_CHECKERS_TYPOLOGY = "editor-checkers";

/** A `folio-editor-checker/v1` node, the fields the bundle reads. */
export interface EditorCheckerNode {
  $schema: typeof EDITOR_CHECKER_SCHEMA;
  id: string;
  contentType: string;
  kinds?: string[];
  /** File types the profile serves, by ending (`.json`). Absent: Markdown. */
  extensions?: string[];
  check?: string;
  open?: string;
  issue?: string;
  macros?: string;
  crepe?: { latexConfig?: string; nodeViews?: Record<string, string>; remarkFirst?: string };
  rawLatexFirstFor?: string[];
}

/** A node and the instance root its code refs resolve against. */
export interface FoundProfile {
  node: EditorCheckerNode;
  root: string;
  file: string;
}

/** What the page config carries for one profile (`cfg.suggest.profiles[]`). */
export interface SuggestProfile {
  id: string;
  /** The bundle, relative to the page or absolute. */
  module: string;
  kinds?: string[];
  extensions?: string[];
  rawLatexFirstFor?: string[];
}

/** Every editor-checker node the checkout declares for `contentType`, in declaration order. */
export function editorProfiles(repoRoot: string, contentType: string): FoundProfile[] {
  const out: FoundProfile[] = [];
  for (const root of instanceRootsIn(repoRoot)) {
    for (const dir of ownDeclaredDirectories(root, EDITOR_CHECKERS_TYPOLOGY, repoRoot)) {
      if (!existsSync(dir)) continue;
      for (const f of readdirSync(dir).filter((n) => n.endsWith(".json")).sort()) {
        const file = join(dir, f);
        let node: EditorCheckerNode;
        try {
          node = JSON.parse(readFileSync(file, "utf-8")) as EditorCheckerNode;
        } catch {
          continue; // an unreadable node is its own instance's validator's finding
        }
        if (node?.$schema !== EDITOR_CHECKER_SCHEMA || node.contentType !== contentType) continue;
        // A profile does something: checks an edit, or opens an editor.
        if (!node.check && !node.open) continue;
        out.push({ node, root, file });
      }
    }
  }
  return out;
}

/** `path.ts#Export` → the absolute file and the export, or why not. */
export function resolveCodeRef(root: string, ref: string): { file: string; name: string } {
  const m = /^([^#\s]+\.ts)#([A-Za-z_$][\w$]*)$/.exec(ref);
  if (!m) throw new Error(`"${ref}" is not a code ref (path.ts#Export)`);
  const file = resolve(root, m[1]!);
  if (!file.startsWith(resolve(root) + sep)) throw new Error(`"${ref}" names a file outside its instance`);
  if (!existsSync(file)) throw new Error(`"${ref}": ${m[1]} does not exist`);
  return { file, name: m[2]! };
}

/** The bundle's entry: each code ref re-exported under its role. */
export function profileEntrySource(p: FoundProfile): string {
  const at = (ref: string) => resolveCodeRef(p.root, ref);
  const lines: string[] = [];
  const role = (r: string, ref: string | undefined) => {
    if (!ref) return;
    const { file, name } = at(ref);
    lines.push(`export { ${name} as ${r} } from ${JSON.stringify(file)};`);
  };
  role("check", p.node.check);
  role("macros", p.node.macros);
  role("latexConfig", p.node.crepe?.latexConfig);
  role("remarkFirst", p.node.crepe?.remarkFirst);
  role("open", p.node.open);
  role("issue", p.node.issue);
  const views = Object.entries(p.node.crepe?.nodeViews ?? {});
  views.forEach(([, ref], i) => {
    const { file, name } = at(ref);
    lines.push(`import { ${name} as nodeView${i} } from ${JSON.stringify(file)};`);
  });
  if (views.length) lines.push(`export const nodeViews = { ${views.map(([n], i) => `${JSON.stringify(n)}: nodeView${i}`).join(", ")} };`);
  return lines.join("\n") + "\n";
}

/**
 * Bundle every profile for `contentType` into `outDir/<id>.js` (browser ESM,
 * no external imports) and return what the page config carries, each module
 * as `urlPrefix + <id>.js`. No profile: nothing written, `[]` returned.
 */
export async function bundleEditorProfiles(repoRoot: string, contentType: string, outDir: string, urlPrefix: string): Promise<SuggestProfile[]> {
  const found = editorProfiles(repoRoot, contentType);
  if (found.length === 0) return [];
  mkdirSync(outDir, { recursive: true });
  const work = mkdtempSync(join(tmpdir(), "editor-profile-"));
  const out: SuggestProfile[] = [];
  try {
    for (const p of found) {
      const entry = join(work, `${p.node.id}.ts`);
      writeFileSync(entry, profileEntrySource(p));
      const r = await Bun.build({ entrypoints: [entry], target: "browser", format: "esm", minify: true });
      if (!r.success || r.outputs.length !== 1) throw new Error(`editor profile ${p.node.id} (${p.file}) did not bundle: ${r.logs.map(String).join("; ")}`);
      writeFileSync(join(outDir, `${p.node.id}.js`), await r.outputs[0]!.text());
      out.push({
        id: p.node.id,
        module: `${urlPrefix}${p.node.id}.js`,
        ...(p.node.kinds?.length ? { kinds: p.node.kinds } : {}),
        ...(p.node.extensions?.length ? { extensions: p.node.extensions } : {}),
        ...(p.node.rawLatexFirstFor?.length ? { rawLatexFirstFor: p.node.rawLatexFirstFor } : {}),
      });
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  return out;
}
