/**
 * stage-local's IG adapter: build a FHIR IG the way its reusable workflow
 * does, and lay the output on the publish branch the way that workflow does.
 *
 * @module scripts/stage-local-ig
 * @covers none — a PUBLISHER's half, not an audit: it plans and runs one IG build and judges nothing
 *
 * ## Read from the workflow, never restated
 *
 * An IG repository names its reusable workflow in its own
 * `.github/workflows/*.yml` (`uses: <owner>/<repo>/.github/workflows/<file>@<ref>`).
 * That file is fetched at that ref and its `build` job is PLANNED step by
 * step: each `run:` block is run as written, with the environment GitHub
 * would give it; each `docker://` step is run in its image with the
 * workspace mounted; the `JamesIves/github-pages-deploy-action` steps are
 * READ for the layout (folder, target folder, commit message, clean and
 * clean-exclude) and performed here, because the agent pushes, not the
 * action. A change to the workflow's build is therefore a change here
 * without an edit.
 *
 * ## What is not run, and why
 *
 * {@link planIgSteps} skips, and the plan names, every step that:
 * - is an Actions action other than a `docker://` one (the checkout IS the
 *   agent's checkout; `setup-python` is a fresh venv; an artifact upload has
 *   nowhere to go);
 * - reads a secret (a PR lookup, a PR comment, the branch index): the agent
 *   path hands no token to a downloaded script;
 * - commits or pushes to the SOURCE branch (the README write-back), since a
 *   publish never writes to the branch it publishes;
 * - has an `if:` that is false here.
 *
 * ## `fhirbuild.yml` builds nothing on Pages
 *
 * smart-base's `fhirbuild.yml` posts the commit to build.fhir.org's
 * auto-build trigger and nothing else. The Pages build its callers' headers
 * describe ("publish default branches to /, other branches
 * branches/<branch>") is its sibling `ghbuild.yml`, which upstream callers
 * call beside it. So a called workflow with no deploy step is resolved to the
 * `ghbuild.yml` beside it at the same ref ({@link PAGES_SIBLING}), and the
 * plan says so. The build.fhir.org trigger is not sent: it is an external
 * build, and starting one is not publishing this repository's Pages.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { parse as parseYaml } from "yaml";

/** The reusable workflow a folio calls. */
export const FOLIO_WORKFLOW = "folio-staging.yml";
/** The reusable workflows an IG calls (smart-base's). */
export const IG_WORKFLOWS = ["fhirbuild.yml", "ghbuild.yml"] as const;
/** Where an IG workflow with no deploy step finds its Pages build: the sibling beside it. */
export const PAGES_SIBLING = "ghbuild.yml";
/** What marks a publish root as a folio's: `publish-main`'s manifest, the previews, the render log. */
export const FOLIO_ROOT_MARKERS = ["_main-site.json", "STAGING", "_render-log"] as const;
/**
 * Paths `JamesIves/github-pages-deploy-action@v4` never deletes under
 * `clean`, whatever `clean-exclude` says: the action's own built-in excludes.
 */
export const DEPLOY_ACTION_ALWAYS_KEPT = [".git", ".ssh", ".github"] as const;

export interface UsesRef {
  owner: string;
  repo: string;
  /** Path inside that repository, e.g. `.github/workflows/fhirbuild.yml`. */
  path: string;
  ref: string;
  file: string;
}

/** `<owner>/<repo>/<path>@<ref>` for a reusable workflow, or undefined. */
export function parseUses(s: string): UsesRef | undefined {
  const m = /^([^/\s]+)\/([^/\s]+)\/(\.github\/workflows\/[^@\s]+)@(\S+)$/.exec(s.trim().replace(/^['"]|['"]$/g, ""));
  if (!m) return undefined;
  return { owner: m[1]!, repo: m[2]!, path: m[3]!, ref: m[4]!, file: m[3]!.split("/").pop()! };
}

export type Publisher = "folio" | "ig";

export interface Detected {
  kind: Publisher;
  caller: string;
  uses: UsesRef;
  /** The other kind, when the repository also calls it (smart-ra carries a folio AND an IG). */
  alsoCalls?: { kind: Publisher; caller: string; file: string };
}

/**
 * Which publisher a repository uses, from the reusable workflows its own
 * workflow files call. Pure over `{file name → text}`. Throws when it names
 * none.
 *
 * A repository may call both: smart-ra is a folio with a FHIR IG under
 * `input/`. Then the FOLIO is chosen unless `prefer` says otherwise, because
 * the folio owns the publish root (`publish-main` keeps `STAGING/` and
 * `_render-log/` there), while the IG's root deploy is a clean one that
 * would delete both.
 */
export function detectPublisher(workflows: Map<string, string>, prefer?: Publisher): Detected {
  const found: Detected[] = [];
  const seen: string[] = [];
  for (const [caller, text] of [...workflows.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    for (const m of text.matchAll(/^\s*uses:\s*(\S+)\s*$/gm)) {
      const u = parseUses(m[1]!);
      if (!u) continue;
      seen.push(`${caller} → ${u.file}`);
      if (u.file === FOLIO_WORKFLOW) found.push({ kind: "folio", caller, uses: u });
      else if ((IG_WORKFLOWS as readonly string[]).includes(u.file)) found.push({ kind: "ig", caller, uses: u });
    }
  }
  if (found.length === 0) throw new Error(`no workflow here calls ${FOLIO_WORKFLOW} or ${IG_WORKFLOWS.join("/")}${seen.length ? ` (found: ${seen.join(", ")})` : ""} — nothing to mirror`);
  const want: Publisher = prefer ?? (found.some((f) => f.kind === "folio") ? "folio" : "ig");
  const mine = found.filter((f) => f.kind === want);
  if (mine.length === 0) throw new Error(`--publisher ${want}: no workflow here calls ${want === "folio" ? FOLIO_WORKFLOW : IG_WORKFLOWS.join("/")}`);
  // An IG that calls both (upstream smart-* call fhirbuild.yml AND ghbuild.yml): the Pages one is the build.
  const chosen = mine.find((f) => f.uses.file === PAGES_SIBLING) ?? mine[0]!;
  const other = found.find((f) => f.kind !== want);
  return other ? { ...chosen, alsoCalls: { kind: other.kind, caller: other.caller, file: other.uses.file } } : chosen;
}

/** The `with:` a caller passes to the reusable workflow it calls, as strings. */
export function callerInputs(text: string, u: UsesRef): Record<string, unknown> {
  const y = parseYaml(text) as { jobs?: Record<string, { uses?: string; with?: Record<string, unknown> }> };
  for (const j of Object.values(y?.jobs ?? {})) {
    const c = j.uses ? parseUses(j.uses) : undefined;
    if (c && c.path === u.path && c.owner === u.owner && c.repo === u.repo) return { ...(j.with ?? {}) };
  }
  return {};
}

/** Every `.github/workflows/*.yml|yaml` of a repository, by file name. */
export function readWorkflows(repo: string): Map<string, string> {
  const dir = join(repo, ".github", "workflows");
  const out = new Map<string, string>();
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir)) if (/\.ya?ml$/.test(f)) out.set(f, readFileSync(join(dir, f), "utf-8"));
  return out;
}

/**
 * The text of a reusable workflow, at the ref its caller names. From `source`
 * (a local checkout of that repository) when given, otherwise fetched with
 * git into a bare cache, so nothing is installed and no API is called.
 */
export function fetchWorkflow(u: UsesRef, path: string, source?: string): string {
  if (source) {
    const f = join(resolve(source), path);
    if (!existsSync(f)) throw new Error(`${f}: not in the given workflow source`);
    return readFileSync(f, "utf-8");
  }
  const cache = join(tmpdir(), "stage-local-workflows", `${u.owner}__${u.repo}.git`);
  if (!existsSync(cache)) {
    mkdirSync(cache, { recursive: true });
    execFileSync("git", ["init", "-q", "--bare", cache]);
  }
  execFileSync("git", ["-C", cache, "fetch", "-q", "--depth=1", "--filter=blob:none", `https://github.com/${u.owner}/${u.repo}`, u.ref], { stdio: ["ignore", "ignore", "inherit"] });
  return execFileSync("git", ["-C", cache, "show", `FETCH_HEAD:${path}`], { encoding: "utf-8" });
}

// ── The workflow, as data ──────────────────────────────────────────────────

export interface WfStep {
  name?: string;
  id?: string;
  if?: string | boolean;
  uses?: string;
  run?: string;
  shell?: string;
  env?: Record<string, unknown>;
  with?: Record<string, unknown>;
  "continue-on-error"?: boolean | string;
}

export interface Workflow {
  inputs: Record<string, unknown>;
  jobEnv: Record<string, unknown>;
  steps: WfStep[];
}

/** The single job of an IG's reusable workflow, with its `workflow_call` input defaults. */
export function readWorkflow(text: string): Workflow {
  const y = parseYaml(text) as { on?: Record<string, { inputs?: Record<string, { default?: unknown }> }>; jobs?: Record<string, { steps?: WfStep[]; env?: Record<string, unknown> }> };
  const call = y.on?.workflow_call?.inputs ?? {};
  const inputs: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(call)) if (v && "default" in v) inputs[k] = v.default;
  const jobs = Object.values(y.jobs ?? {});
  const job = jobs.find((j) => j.steps?.some((s) => /github-pages-deploy-action/.test(s.uses ?? ""))) ?? jobs[0];
  return { inputs, jobEnv: job?.env ?? {}, steps: job?.steps ?? [] };
}

export interface IgDeploy {
  branch: string;
  folder: string;
  /** Relative to the publish root; "" for the root itself. May hold `${{ env.BRANCH_DIR }}`. */
  targetFolder: string;
  message: string;
  clean: boolean;
  cleanExclude: string[];
  singleCommit: boolean;
}

/**
 * The deploy steps of the workflow: the first `github-pages-deploy-action`
 * step whose condition is the default branch (`main`) and the first that is
 * not (`candidate`). Retries (conditioned on an earlier step's outcome) are
 * the same deploy again and are not read.
 */
export function readIgDeploys(wf: Workflow): { main?: IgDeploy; candidate?: IgDeploy } {
  const out: { main?: IgDeploy; candidate?: IgDeploy } = {};
  for (const s of wf.steps) {
    if (!/github-pages-deploy-action/.test(s.uses ?? "")) continue;
    const cond = String(s.if ?? "");
    if (/\.outcome\s*==/.test(cond)) continue;
    const which = /IS_DEFAULT_BRANCH\s*==\s*'true'/.test(cond) ? "main" : /IS_DEFAULT_BRANCH\s*==\s*'false'/.test(cond) ? "candidate" : undefined;
    if (!which || out[which]) continue;
    const w = s.with ?? {};
    const str = (k: string, d: string) => (w[k] === undefined ? d : String(w[k]).trim());
    out[which] = {
      branch: str("branch", "gh-pages"),
      folder: str("folder", ".").replace(/^\.\//, "").replace(/\/+$/, "") || ".",
      targetFolder: str("target-folder", "").replace(/^\.?\/+/, "").replace(/\/+$/, ""),
      message: str("commit-message", ""),
      clean: str("clean", "true") !== "false",
      cleanExclude: str("clean-exclude", "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean),
      singleCommit: str("single-commit", "false") === "true",
    };
  }
  return out;
}

// ── Expressions ────────────────────────────────────────────────────────────

export interface ExprContext {
  github: Record<string, string>;
  inputs: Record<string, unknown>;
  env: Record<string, string>;
  steps: Record<string, { outputs: Record<string, string>; outcome?: string }>;
}

type Tok = { t: "id" | "str" | "op" | "(" | ")" | "num"; v: string };

function tokenize(s: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i]!;
    if (/\s/.test(c)) { i++; continue; }
    if (c === "'") {
      let v = "";
      i++;
      while (i < s.length) {
        if (s[i] === "'" && s[i + 1] === "'") { v += "'"; i += 2; continue; }
        if (s[i] === "'") break;
        v += s[i++];
      }
      i++;
      out.push({ t: "str", v });
      continue;
    }
    const two = s.slice(i, i + 2);
    if (["==", "!=", "&&", "||", "<=", ">="].includes(two)) { out.push({ t: "op", v: two }); i += 2; continue; }
    if (c === "!" || c === "<" || c === ">") { out.push({ t: "op", v: c }); i++; continue; }
    if (c === "(" || c === ")") { out.push({ t: c, v: c }); i++; continue; }
    const m = /^[A-Za-z_][\w.-]*|^\d+(\.\d+)?/.exec(s.slice(i));
    if (!m) throw new Error(`cannot read expression '${s}' at '${s.slice(i)}'`);
    out.push({ t: /^\d/.test(m[0]) ? "num" : "id", v: m[0] });
    i += m[0].length;
  }
  return out;
}

type Val = string | boolean | number | undefined;
const truthy = (v: Val) => v !== undefined && v !== "" && v !== false && v !== 0;
const asStr = (v: Val) => (v === undefined ? "" : String(v));

/**
 * Evaluate a GitHub Actions expression over the context. Enough of the
 * language for a workflow's `if:` and `${{ }}`: property paths, string and
 * number literals, `== != ! && || ( )`, and the status functions — which are
 * all "nothing has failed", since a failed step stops the run here.
 * Comparison is on strings (`true` and `'true'` are equal), the reading every
 * condition in an IG workflow means.
 */
export function evalExpr(expr: string, ctx: ExprContext): Val {
  const src = expr.trim().replace(/^\$\{\{\s*([\s\S]*?)\s*\}\}$/, "$1");
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  const lookup = (path: string): Val => {
    const [head, ...rest] = path.split(".");
    if (head === "true") return true;
    if (head === "false") return false;
    if (head === "null") return undefined;
    let v: unknown = head === "github" ? ctx.github : head === "inputs" ? ctx.inputs : head === "env" ? ctx.env : head === "steps" ? ctx.steps : head === "secrets" ? {} : undefined;
    for (const k of rest) v = v && typeof v === "object" ? (v as Record<string, unknown>)[k] : undefined;
    return v as Val;
  };
  const primary = (): Val => {
    const t = toks[p++];
    if (!t) throw new Error(`unexpected end of expression '${src}'`);
    if (t.t === "str") return t.v;
    if (t.t === "num") return Number(t.v);
    if (t.t === "(") { const v = or(); p++; return v; }
    if (t.t === "op" && t.v === "!") return !truthy(primary());
    if (t.t === "id") {
      if (peek()?.t === "(") {
        p++;
        while (peek() && peek()!.t !== ")") p++;
        p++;
        if (["success", "always", "cancelled", "failure"].includes(t.v)) return t.v === "success" || t.v === "always";
        throw new Error(`function ${t.v}() is not supported here`);
      }
      return lookup(t.v);
    }
    throw new Error(`unexpected '${t.v}' in '${src}'`);
  };
  const cmp = (): Val => {
    let l = primary();
    while (peek()?.t === "op" && ["==", "!="].includes(peek()!.v)) {
      const op = toks[p++]!.v;
      const r = primary();
      const eq = asStr(l).toLowerCase() === asStr(r).toLowerCase();
      l = op === "==" ? eq : !eq;
    }
    return l;
  };
  const and = (): Val => {
    let l = cmp();
    while (peek()?.v === "&&") { p++; const r = cmp(); l = truthy(l) ? r : l; }
    return l;
  };
  const or = (): Val => {
    let l = and();
    while (peek()?.v === "||") { p++; const r = and(); l = truthy(l) ? l : r; }
    return l;
  };
  const v = or();
  if (p !== toks.length) throw new Error(`trailing tokens in '${src}'`);
  return v;
}

/** Replace every `${{ … }}` in a string with its value. */
export function interpolate(s: string, ctx: ExprContext): string {
  return s.replace(/\$\{\{([\s\S]*?)\}\}/g, (_, e: string) => asStr(evalExpr(e, ctx)));
}

/** An `if:` as GitHub reads it: absent is true, and a bare expression needs no `${{ }}`. */
export function stepRuns(cond: WfStep["if"], ctx: ExprContext): boolean {
  if (cond === undefined) return true;
  if (typeof cond === "boolean") return cond;
  return truthy(evalExpr(cond, ctx));
}

// ── The plan ───────────────────────────────────────────────────────────────

export type StepAction = "run" | "docker" | "venv" | "deploy" | "skip";

export interface PlannedStep {
  name: string;
  action: StepAction;
  reason?: string;
  /** The step itself, for `run` and `docker`. */
  step: WfStep;
}

/** Why a step is not run on this path, or undefined when it is. Pure over the step. */
export function skipReason(s: WfStep): { action: StepAction; reason?: string } {
  const env = JSON.stringify(s.env ?? {});
  const uses = s.uses ?? "";
  if (/github-pages-deploy-action/.test(uses)) return { action: "deploy", reason: "performed by stage-local: the agent pushes, not the action" };
  if (uses.startsWith("docker://")) return { action: "docker" };
  if (/^actions\/setup-python@/.test(uses)) return { action: "venv", reason: "a fresh venv stands in for the runner's Python" };
  if (/^actions\/checkout@/.test(uses)) return { action: "skip", reason: "the agent's checkout is the content" };
  if (uses) return { action: "skip", reason: `an Actions action (${uses.split("@")[0]}) with no runner here` };
  if (/secrets\./.test(env)) return { action: "skip", reason: "reads a secret; the agent path hands no token to a downloaded script" };
  if (/\bgit\s+(-C\s+\S+\s+)?(push|commit)\b/.test(s.run ?? "")) return { action: "skip", reason: "commits or pushes to the source branch; a publish never writes the branch it publishes" };
  return { action: "run" };
}

/**
 * Every step of the workflow, in order, with what this path does with it.
 * Conditions are evaluated against `ctx` as it stands; the run re-evaluates
 * each as it reaches it, because earlier steps set `env`.
 */
export function planIgSteps(wf: Workflow, ctx: ExprContext): PlannedStep[] {
  const setEarlier = new Set<string>();
  return wf.steps.map((s, i) => {
    const name = s.name ?? s.uses ?? `step ${i + 1}`;
    const k = skipReason(s);
    const written = envWrittenBy(s);
    try {
      if (k.action === "skip" || k.action === "deploy") return { name, ...k, step: s };
      const pending = [...String(s.if ?? "").matchAll(/env\.([A-Za-z_]\w*)/g)].map((m) => m[1]!).filter((v) => setEarlier.has(v) && !(v in ctx.env));
      if (pending.length) return { name, ...k, reason: `runs if ${String(s.if)} — ${pending.join(", ")} is set by an earlier step, so decided when the run reaches it`, step: s };
      let runs: boolean;
      try {
        runs = stepRuns(s.if, ctx);
      } catch (e) {
        return { name, action: "skip" as const, reason: `condition not readable here: ${(e as Error).message}`, step: s };
      }
      if (!runs) return { name, action: "skip" as const, reason: `if: ${String(s.if)} is false here`, step: s };
      return { name, ...k, step: s };
    } finally {
      for (const v of written) setEarlier.add(v);
    }
  });
}

/** The variables a step exports to later steps through `$GITHUB_ENV`. */
export function envWrittenBy(s: WfStep): string[] {
  return [...(s.run ?? "").matchAll(/\b([A-Za-z_]\w*)=[^\n]*>>\s*"?\$\{?GITHUB_ENV/g)].map((m) => m[1]!);
}

/** The workflow's branch directory rule (resolve_branch.py `_branch_dir`): the last path component. Used for the PLAN; a run takes `BRANCH_DIR` from the workflow's own step. */
export function branchDirOf(branch: string): string {
  return branch.replace(/^refs\/heads\//, "").split("/").pop()!;
}

export interface IgTarget {
  deploy: IgDeploy;
  /** Relative to the publish root; "" is the root. */
  dest: string;
  /** With `clean` at the root: what is kept; everything else at the root is replaced. */
  keep?: string[];
  commit: string[];
}

/** Where the IG's output goes and how, from the workflow's deploy steps. Pure. */
export function igTarget(d: { main?: IgDeploy; candidate?: IgDeploy }, o: { isDefault: boolean; branchDir: string; sha: string; runUrl: string }): IgTarget {
  const deploy = o.isDefault ? d.main : d.candidate;
  if (!deploy) throw new Error(`the workflow has no ${o.isDefault ? "default-branch" : "candidate-branch"} deploy step to mirror`);
  const dest = deploy.targetFolder.replace(/\$\{\{\s*env\.BRANCH_DIR\s*\}\}/g, o.branchDir);
  if (dest.split("/").some((s) => s === ".." || s === ".")) throw new Error(`deploy target '${dest}' leaves the publish root`);
  if (!o.isDefault && (dest === "" || !dest.includes(o.branchDir))) throw new Error(`a candidate deploy to '${dest || "/"}' would overwrite the root; refusing`);
  const keep = dest === "" && deploy.clean ? [...new Set([...DEPLOY_ACTION_ALWAYS_KEPT, ...deploy.cleanExclude])] : undefined;
  return { deploy, dest, ...(keep ? { keep } : {}), commit: [deploy.message || `Deploy ${o.isDefault ? "main" : "candidate"} branch`, `from ${o.sha}`, `built locally: ${o.runUrl}`] };
}

/**
 * Lay the built folder onto a publish-branch checkout as the deploy action
 * would: into the target folder, without deleting when `clean` is off; at the
 * root with `clean`, removing every top-level entry not kept first.
 */
export function applyIgDeploy(pages: string, folder: string, t: IgTarget, copy: (from: string, to: string) => void): void {
  const dest = join(pages, t.dest);
  if (t.keep) {
    const folio = FOLIO_ROOT_MARKERS.filter((m) => existsSync(join(pages, m)) && !t.keep!.includes(m));
    if (folio.length) throw new Error(`the publish branch carries a folio's site (${folio.join(", ")}); a clean IG deploy at the root would delete it — refusing`);
    for (const e of readdirSync(pages)) if (!t.keep.includes(e)) rmSync(join(pages, e), { recursive: true, force: true });
  } else if (t.dest !== "" && t.deploy.clean) {
    rmSync(dest, { recursive: true, force: true });
  }
  mkdirSync(dest, { recursive: true });
  copy(folder, dest);
}

// ── Running it ─────────────────────────────────────────────────────────────

/** Split a docker action's `args` the way the runner does: on whitespace, honouring quotes. */
export function splitArgs(s: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q: string | null = null;
  let any = false;
  for (const c of s) {
    if (q) {
      if (c === q) q = null;
      else cur += c;
    } else if (c === '"' || c === "'") {
      q = c;
      any = true;
    } else if (/\s/.test(c)) {
      if (cur || any) out.push(cur);
      cur = "";
      any = false;
    } else cur += c;
  }
  if (cur || any) out.push(cur);
  return out;
}

/** What a run needs on this machine that is missing, by name. Empty when nothing is. */
export function missingPrerequisites(plan: PlannedStep[], has: (cmd: string[]) => boolean): string[] {
  const out: string[] = [];
  const docker = plan.some((s) => s.action === "docker" || (s.action === "run" && /\bdocker\s+(run|exec)\b/.test(s.step.run ?? "")));
  if (docker && !has(["docker", "info"])) out.push("a running Docker daemon (the workflow runs IG Publisher in its container image; `docker info` fails here)");
  if (plan.some((s) => s.action === "venv") && !has(["python3", "-m", "venv", "--help"])) out.push("python3 with the venv module (stands in for actions/setup-python)");
  if (plan.some((s) => s.action === "run") && !has(["bash", "--version"])) out.push("bash");
  if (!has(["curl", "--version"])) out.push("curl (the workflow fetches its scripts and IG Publisher with it)");
  return out;
}

export const commandWorks = (cmd: string[]): boolean => spawnSync(cmd[0]!, cmd.slice(1), { stdio: "ignore", timeout: 20_000 }).status === 0;

/** Read `KEY=VALUE` lines and `KEY<<DELIM` blocks from a GITHUB_ENV / GITHUB_OUTPUT file. */
export function readEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    const h = /^([^=<]+)<<(.+)$/.exec(l);
    if (h) {
      const body: string[] = [];
      for (i++; i < lines.length && lines[i] !== h[2]; i++) body.push(lines[i]!);
      out[h[1]!] = body.join("\n");
      continue;
    }
    const e = l.indexOf("=");
    if (e > 0) out[l.slice(0, e)] = l.slice(e + 1);
  }
  return out;
}

/**
 * Run the planned build in `repo`, in the workflow's order, with the
 * environment the runner would give each step. Throws at the first failing
 * step that is not `continue-on-error`. Returns the final context, whose
 * `env` holds what the steps exported (`BRANCH_DIR`, `IS_DEFAULT_BRANCH`).
 */
export function runIgBuild(repo: string, wf: Workflow, ctx: ExprContext, log: (s: string) => void): ExprContext {
  const scratch = join(tmpdir(), `stage-local-ig-${process.pid}`);
  mkdirSync(scratch, { recursive: true });
  const envFile = join(scratch, "github_env");
  writeFileSync(envFile, "");
  let path = process.env.PATH ?? "";
  for (const [k, v] of Object.entries(wf.jobEnv)) ctx.env[k] = interpolate(String(v), ctx);
  try {
  for (const [i, s] of wf.steps.entries()) {
    const name = s.name ?? s.uses ?? `step ${i + 1}`;
    const k = skipReason(s);
    if (k.action === "skip" || k.action === "deploy") { log(`  – ${name}: ${k.reason}`); continue; }
    if (!stepRuns(s.if, ctx)) { log(`  – ${name}: if: ${String(s.if)} is false here`); continue; }
    log(`  ▸ ${name}`);
    const outFile = join(scratch, `output-${i}`);
    writeFileSync(outFile, "");
    const stepEnv: Record<string, string> = {};
    for (const [key, v] of Object.entries(s.env ?? {})) stepEnv[key] = interpolate(String(v), ctx);
    const env = {
      ...process.env, ...ctx.env, ...stepEnv, PATH: path,
      CI: "true", GITHUB_ACTIONS: "", GITHUB_ENV: envFile, GITHUB_OUTPUT: outFile,
      GITHUB_REPOSITORY: ctx.github.repository!, GITHUB_REF: ctx.github.ref!, GITHUB_REF_NAME: ctx.github.ref_name!,
      GITHUB_SHA: ctx.github.sha!, GITHUB_WORKSPACE: repo, GITHUB_SERVER_URL: ctx.github.server_url!, GITHUB_EVENT_NAME: ctx.github.event_name!,
    };
    let status: number | null = 0;
    if (k.action === "venv") {
      const venv = join(scratch, "venv");
      if (!existsSync(venv)) status = spawnSync("python3", ["-m", "venv", venv], { stdio: "inherit" }).status;
      path = `${join(venv, "bin")}:${path}`;
    } else if (k.action === "docker") {
      const w = s.with ?? {};
      const image = s.uses!.slice("docker://".length);
      const args = ["run", "--rm", "-v", `${repo}:/github/workspace`, "-w", "/github/workspace"];
      if (w.entrypoint) args.push("--entrypoint", interpolate(String(w.entrypoint), ctx));
      args.push(image, ...splitArgs(interpolate(String(w.args ?? ""), ctx)));
      status = spawnSync("docker", args, { cwd: repo, stdio: "inherit", env }).status;
    } else {
      const script = join(scratch, `step-${i}.sh`);
      writeFileSync(script, interpolate(s.run ?? "", ctx));
      status = spawnSync("bash", ["--noprofile", "--norc", "-e", script], { cwd: repo, stdio: "inherit", env }).status;
    }
    if (s.id) ctx.steps[s.id] = { outputs: readEnvFile(readFileSync(outFile, "utf-8")), outcome: status === 0 ? "success" : "failure" };
    Object.assign(ctx.env, readEnvFile(readFileSync(envFile, "utf-8")));
    if (status !== 0 && String(s["continue-on-error"] ?? "false") !== "true") throw new Error(`workflow step '${name}' exited ${status}`);
  }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
  return ctx;
}
