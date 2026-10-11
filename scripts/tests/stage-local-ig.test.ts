/**
 * stage-local as ONE publish path: which publisher a repository uses, main
 * site or preview, where the output lands, what is kept at the root, and the
 * commit — for a folio and for an IG. The builds themselves are the
 * workflows' own steps and scripts, tested where they live.
 */
import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { chooseTarget, composeIg, composeMain, mainCommitMessage, parseSymref, platformScript, previewCommitMessage, stageLocal } from "../stage-local.ts";
import {
  applyIgDeploy,
  branchDirOf,
  callerInputs,
  detectPublisher,
  evalExpr,
  type ExprContext,
  igTarget,
  missingPrerequisites,
  parseUses,
  planIgSteps,
  readEnvFile,
  readIgDeploys,
  readWorkflow,
  splitArgs,
} from "../stage-local-ig.ts";

const tmp = (p: string) => mkdtempSync(join(tmpdir(), p));
const put = (root: string, rel: string, text = "x") => {
  mkdirSync(join(root, rel, ".."), { recursive: true });
  writeFileSync(join(root, rel), text);
};

const FOLIO_CALLER = `on:
  workflow_dispatch:
jobs:
  staging:
    uses: litlfred/folio-assistant/.github/workflows/folio-staging.yml@main
    with:
      build_command: 'bun run build'
`;
const IG_CALLER = `on:
  workflow_dispatch:
jobs:
  call_build:
    uses: WorldHealthOrganization/smart-base/.github/workflows/fhirbuild.yml@main
`;
const IG_PAGES_CALLER = IG_CALLER.replace("fhirbuild.yml", "ghbuild.yml").replace("call_build", "build");

/** The shape of smart-base's ghbuild.yml, cut to the parts the plan reads. */
const IG_WORKFLOW = `on:
  workflow_call:
    inputs:
      do_dak:
        type: boolean
        default: true
      deploy:
        type: boolean
        default: true
jobs:
  build:
    runs-on: ubuntu-latest
    env:
      GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      - name: Setup Python
        uses: actions/setup-python@v5
      - name: Find PR number
        id: find_pr
        env:
          GH_TOKEN: \${{ secrets.GITHUB_TOKEN }}
        run: python3 input/scripts/find_pr.py
      - name: Comment on PR
        if: steps.find_pr.outputs.IS_PR == 'true'
        run: echo comment
      - name: Check for DAK configuration
        run: |
          if [ -f dak.json ]; then echo "DAK_ENABLED=true" >> "$GITHUB_ENV"; fi
      - name: DAK Preprocessing
        if: inputs.do_dak != 'false' && env.DAK_ENABLED == 'true'
        run: python3 input/scripts/transform_dmn.py
      - name: Update the image to the latest publisher
        uses: docker://hl7fhir/ig-publisher-base:latest
        with:
          args: curl -L https://example.org/publisher.jar -o ./input-cache/publisher.jar --create-dirs
      - name: Run the IG publisher
        run: docker exec ig-run java -jar ./input-cache/publisher.jar publisher -ig .
      - name: Upload qa.json artifact
        uses: actions/upload-artifact@v4
      - name: Deploy candidate
        id: deploy_candidate_1
        uses: JamesIves/github-pages-deploy-action@v4.4.2
        if: env.IS_DEFAULT_BRANCH == 'false' && inputs.deploy != false
        with:
          branch: gh-pages
          folder: ./output
          commit-message: Deploy candidate branch
          target-folder: branches/\${{ env.BRANCH_DIR }}
          single-commit: true
          clean: false
      - name: Deploy candidate (retry)
        uses: JamesIves/github-pages-deploy-action@v4.4.2
        if: env.IS_DEFAULT_BRANCH == 'false' && steps.deploy_candidate_1.outcome == 'failure'
        with:
          branch: gh-pages
          folder: ./output
          commit-message: Deploy candidate branch (retry)
          target-folder: elsewhere
      - name: Deploy main
        uses: JamesIves/github-pages-deploy-action@v4.4.2
        if: env.IS_DEFAULT_BRANCH == 'true' && inputs.deploy != false
        with:
          branch: gh-pages
          folder: ./output
          commit-message: Deploy main branch
          single-commit: true
          clean-exclude: |
            branches
            sitepreview
      - name: Commit README.md branch links update
        if: env.IS_DEFAULT_BRANCH == 'true'
        run: |
          git add README.md
          git commit -m "chore: update README.md"
          git push
`;

const ctx = (env: Record<string, string> = {}): ExprContext => ({
  github: { repository: "o/r", ref: "refs/heads/feat", ref_name: "feat", head_ref: "", sha: "abc", event_name: "workflow_dispatch" },
  inputs: { do_dak: true, deploy: true },
  env,
  steps: {},
});

describe("stage-local: which publisher, read from the repository's own workflows", () => {
  test("a caller of folio-staging.yml is a folio; a caller of smart-base's fhirbuild.yml is an IG", () => {
    expect(detectPublisher(new Map([["staging.yml", FOLIO_CALLER]]))).toMatchObject({ kind: "folio", caller: "staging.yml", uses: { file: "folio-staging.yml", ref: "main" } });
    expect(detectPublisher(new Map([["fhirbuild.yml", IG_CALLER]]))).toMatchObject({ kind: "ig", uses: { owner: "WorldHealthOrganization", repo: "smart-base", file: "fhirbuild.yml" } });
  });

  test("an IG calling both smart-base workflows builds with the Pages one", () => {
    expect(detectPublisher(new Map([["fhirbuild.yml", IG_CALLER], ["ghbuild.yml", IG_PAGES_CALLER]])).uses.file).toBe("ghbuild.yml");
  });

  test("a repository calling both kinds publishes the folio unless told otherwise, and says so", () => {
    const both = new Map([["staging.yml", FOLIO_CALLER], ["fhirbuild.yml", IG_CALLER]]);
    expect(detectPublisher(both)).toMatchObject({ kind: "folio", alsoCalls: { kind: "ig", file: "fhirbuild.yml" } });
    expect(detectPublisher(both, "ig")).toMatchObject({ kind: "ig", alsoCalls: { kind: "folio" } });
    expect(() => detectPublisher(new Map([["staging.yml", FOLIO_CALLER]]), "ig")).toThrow(/no workflow here calls/);
  });

  test("a repository calling neither is refused, naming what it does call", () => {
    expect(() => detectPublisher(new Map([["ci.yml", "jobs:\n  x:\n    uses: o/r/.github/workflows/other.yml@v1\n"]]))).toThrow(/other\.yml/);
    expect(() => detectPublisher(new Map())).toThrow(/nothing to mirror/);
  });

  test("uses: references parse, and a caller's with: is read for the inputs", () => {
    expect(parseUses("o/r/.github/workflows/a.yml@v2")).toEqual({ owner: "o", repo: "r", path: ".github/workflows/a.yml", ref: "v2", file: "a.yml" });
    expect(parseUses("actions/checkout@v4")).toBeUndefined();
    const u = parseUses("WorldHealthOrganization/smart-base/.github/workflows/fhirbuild.yml@main")!;
    expect(callerInputs(IG_CALLER.replace("@main\n", "@main\n    with:\n      do_dak: false\n"), u)).toEqual({ do_dak: false });
    expect(callerInputs(IG_CALLER, u)).toEqual({});
  });
});

describe("stage-local: main site or preview", () => {
  test("the default branch publishes the main site; any other branch a preview", () => {
    expect(chooseTarget({ branch: "main", defaultBranch: "main" })).toBe("main");
    expect(chooseTarget({ branch: "claude/x", defaultBranch: "main" })).toBe("preview");
  });

  test("--main is refused off the default branch, and the default branch must be known without it", () => {
    expect(() => chooseTarget({ branch: "claude/x", defaultBranch: "main", main: true })).toThrow(/not the default branch/);
    expect(chooseTarget({ branch: "main", main: true })).toBe("main");
    expect(() => chooseTarget({ branch: "main" })).toThrow(/default branch/);
  });

  test("the default branch is read from ls-remote --symref", () => {
    expect(parseSymref("ref: refs/heads/main\tHEAD\n5a2b76de\tHEAD\n")).toBe("main");
    expect(parseSymref("5a2b76de\tHEAD\n")).toBeUndefined();
  });

  test("the commits: publish-main's for the root, staging(<slug>) for a preview", () => {
    expect(mainCommitMessage("abc123", "main", "https://github.com/o/r/commit/abc123")).toEqual([
      "main-site: from abc123",
      "render-log: rendered the root from main",
      "built locally: https://github.com/o/r/commit/abc123",
    ]);
    expect(previewCommitMessage("feat-x", "abc123", "u")[0]).toBe("staging(feat-x): from abc123");
  });

  test("a platform script is found either side of the 70lx split", () => {
    const p = tmp("stage-local-platform-");
    put(p, "cat-harness/scripts/render-log.ts");
    put(p, "cat-harness-tools/scripts/publish-main-site.ts");
    expect(platformScript(p, "render-log.ts")).toBe(join(p, "cat-harness/scripts/render-log.ts"));
    expect(platformScript(p, "publish-main-site.ts")).toBe(join(p, "cat-harness-tools/scripts/publish-main-site.ts"));
    expect(() => platformScript(p, "nothing.ts")).toThrow(/in none of/);
  });
});

describe("stage-local: the folio's main site keeps what publish-main keeps", () => {
  const scripts = (n: string) => join(import.meta.dir, "..", n);

  test("STAGING/, _render-log/ and a hand-placed root file survive; the last publish's files are replaced; a main-site entry is logged", () => {
    const pages = tmp("stage-local-pages-");
    put(pages, "STAGING/feat/index.html", "preview");
    put(pages, "_render-log/README.md", "log");
    put(pages, "CNAME", "example.org");
    put(pages, "gone.html", "old main page");
    writeFileSync(join(pages, "_main-site.json"), JSON.stringify({ $schema: "folio-main-site/v1", commit: "old", files: ["gone.html"] }));
    const site = tmp("stage-local-site-");
    put(site, "index.html", "<p>main");
    put(site, "doc/index.html", "<p>doc");

    const c = composeMain(pages, site, { branch: "main", sha: "abc123", runUrl: "https://github.com/o/r/commit/abc123", script: scripts });
    expect(c.commit[0]).toBe("main-site: from abc123");
    expect(c.add).toEqual(["."]);
    expect(readFileSync(join(pages, "STAGING/feat/index.html"), "utf-8")).toBe("preview");
    expect(readFileSync(join(pages, "CNAME"), "utf-8")).toBe("example.org");
    expect(existsSync(join(pages, "gone.html"))).toBe(false);
    expect(readFileSync(join(pages, "index.html"), "utf-8")).toBe("<p>main");
    expect(JSON.parse(readFileSync(join(pages, "_main-site.json"), "utf-8")).files).toEqual(["doc/index.html", "index.html"]);
    const logs = readdirSync(join(pages, "_render-log"), { recursive: true }).map(String).filter((f) => f.endsWith(".jsonl"));
    const entry = logs.map((f) => readFileSync(join(pages, "_render-log", f), "utf-8")).join("");
    expect(entry).toContain('"kind":"main-site"');
    expect(entry).toContain('"path":"/"');
  });

  test("an empty build is refused before the root is touched (bean oisv)", () => {
    const pages = tmp("stage-local-pages-");
    put(pages, "index.html", "last main");
    writeFileSync(join(pages, "_main-site.json"), JSON.stringify({ $schema: "folio-main-site/v1", commit: "old", files: ["index.html"] }));
    expect(() => composeMain(pages, tmp("stage-local-empty-"), { branch: "main", sha: "a", runUrl: "u", script: scripts })).toThrow();
    expect(readFileSync(join(pages, "index.html"), "utf-8")).toBe("last main");
  });
});

describe("stage-local: an IG lands where its workflow's deploy step puts it", () => {
  const wf = readWorkflow(IG_WORKFLOW);
  const deploys = readIgDeploys(wf);

  test("the deploy steps are read, retries ignored", () => {
    expect(deploys.candidate).toEqual({ branch: "gh-pages", folder: "output", targetFolder: "branches/${{ env.BRANCH_DIR }}", message: "Deploy candidate branch", clean: false, cleanExclude: [], singleCommit: true });
    expect(deploys.main).toMatchObject({ targetFolder: "", message: "Deploy main branch", clean: true, cleanExclude: ["branches", "sitepreview"] });
    expect(wf.inputs).toEqual({ do_dak: true, deploy: true });
  });

  test("default branch → the root, kept paths are the action's own and clean-exclude; other branches → branches/<last component>", () => {
    const main = igTarget(deploys, { isDefault: true, branchDir: "main", sha: "abc", runUrl: "u" });
    expect(main.dest).toBe("");
    expect(main.keep).toEqual([".git", ".ssh", ".github", "branches", "sitepreview"]);
    expect(main.commit).toEqual(["Deploy main branch", "from abc", "built locally: u"]);
    expect(branchDirOf("claude/magical-davinci-cp6tcx")).toBe("magical-davinci-cp6tcx");
    const cand = igTarget(deploys, { isDefault: false, branchDir: branchDirOf("claude/feat-x"), sha: "abc", runUrl: "u" });
    expect(cand.dest).toBe("branches/feat-x");
    expect(cand.keep).toBeUndefined();
    expect(cand.commit[0]).toBe("Deploy candidate branch");
  });

  test("a candidate that would land at the root, or outside it, is refused", () => {
    expect(() => igTarget({ candidate: { ...deploys.candidate!, targetFolder: "" } }, { isDefault: false, branchDir: "x", sha: "a", runUrl: "u" })).toThrow(/overwrite the root/);
    expect(() => igTarget(deploys, { isDefault: false, branchDir: "..", sha: "a", runUrl: "u" })).toThrow(/leaves the publish root/);
    expect(() => igTarget({ main: deploys.main! }, { isDefault: false, branchDir: "x", sha: "a", runUrl: "u" })).toThrow(/no candidate-branch deploy/);
  });

  test("the main deploy cleans the root but keeps branches/ and sitepreview/; a candidate deletes nothing", () => {
    const pages = tmp("stage-local-ig-pages-");
    put(pages, "branches/feat/index.html", "feat");
    put(pages, "sitepreview/a.html");
    put(pages, ".git/HEAD");
    put(pages, "stale.html");
    const out = tmp("stage-local-ig-out-");
    put(out, "index.html", "new main");
    composeIg(pages, out, igTarget(deploys, { isDefault: true, branchDir: "main", sha: "a", runUrl: "u" }));
    expect(readdirSync(pages).sort()).toEqual([".git", "branches", "index.html", "sitepreview"]);
    expect(readFileSync(join(pages, "branches/feat/index.html"), "utf-8")).toBe("feat");

    put(pages, "branches/feat/old.html");
    const c = composeIg(pages, out, igTarget(deploys, { isDefault: false, branchDir: "feat", sha: "a", runUrl: "u" }));
    expect(c.add).toEqual(["branches/feat"]);
    expect(existsSync(join(pages, "branches/feat/old.html"))).toBe(true);
    expect(readFileSync(join(pages, "branches/feat/index.html"), "utf-8")).toBe("new main");
  });

  test("a clean IG deploy at the root is refused on a publish branch that carries a folio's site", () => {
    const pages = tmp("stage-local-ig-pages-");
    put(pages, "STAGING/x/index.html");
    put(pages, "_main-site.json", "{}");
    const out = tmp("stage-local-ig-out-");
    put(out, "index.html");
    expect(() => applyIgDeploy(pages, out, igTarget(deploys, { isDefault: true, branchDir: "main", sha: "a", runUrl: "u" }), () => {})).toThrow(/folio's site/);
    expect(existsSync(join(pages, "STAGING/x/index.html"))).toBe(true);
  });
});

describe("stage-local: the IG build is the workflow's own steps, planned", () => {
  test("each step is run, run in its image, stood in for, performed here, or skipped with its reason", () => {
    const plan = planIgSteps(readWorkflow(IG_WORKFLOW), ctx({ IS_DEFAULT_BRANCH: "true", BRANCH_DIR: "main" }));
    const by = Object.fromEntries(plan.map((s) => [s.name, s]));
    expect(by["Checkout code"]!.action).toBe("skip");
    expect(by["Setup Python"]!.action).toBe("venv");
    expect(by["Find PR number"]).toMatchObject({ action: "skip", reason: expect.stringMatching(/secret/) });
    expect(by["Comment on PR"]).toMatchObject({ action: "skip", reason: expect.stringMatching(/false here/) });
    expect(by["Check for DAK configuration"]!.action).toBe("run");
    expect(by["DAK Preprocessing"]).toMatchObject({ action: "run", reason: expect.stringMatching(/decided when the run reaches it/) });
    expect(by["Update the image to the latest publisher"]!.action).toBe("docker");
    expect(by["Upload qa.json artifact"]!.action).toBe("skip");
    expect(by["Deploy main"]!.action).toBe("deploy");
    expect(by["Commit README.md branch links update"]).toMatchObject({ action: "skip", reason: expect.stringMatching(/source branch/) });
  });

  test("a run that needs Docker names it when there is no daemon", () => {
    const plan = planIgSteps(readWorkflow(IG_WORKFLOW), ctx());
    expect(missingPrerequisites(plan, (cmd) => cmd[0] !== "docker")).toEqual([expect.stringMatching(/Docker daemon/)]);
    expect(missingPrerequisites(plan, () => true)).toEqual([]);
  });

  test("expressions read as the runner reads them", () => {
    const c = ctx({ DAK_ENABLED: "true" });
    expect(evalExpr("inputs.do_dak != 'false' && env.DAK_ENABLED == 'true'", c)).toBe(true);
    expect(evalExpr("${{ inputs.deploy != false }}", c)).toBe(true);
    expect(evalExpr("steps.find_pr.outputs.IS_PR == 'true'", c)).toBe(false);
    expect(evalExpr("github.head_ref || github.ref_name", c)).toBe("feat");
    expect(evalExpr("!cancelled()", c)).toBe(true);
    expect(evalExpr("secrets.GITHUB_TOKEN", c)).toBeUndefined();
  });

  test("GITHUB_ENV files and docker args are read as the runner writes and splits them", () => {
    expect(readEnvFile("A=1\nB=x=y\nC<<EOF\nl1\nl2\nEOF\n")).toEqual({ A: "1", B: "x=y", C: "l1\nl2" });
    expect(splitArgs(`-c "mkdir -p ./x && chown 1001:127 ./x"`)).toEqual(["-c", "mkdir -p ./x && chown 1001:127 ./x"]);
    expect(splitArgs("curl -L u -o ./p.jar")).toEqual(["curl", "-L", "u", "-o", "./p.jar"]);
  });
});

describe("stage-local end to end: an IG published to a local origin, preview then main", () => {
  const sh = (cwd: string, ...args: string[]) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf-8" }).trim();

  test("runs the workflow's steps, lays the output where its deploy steps say, and pushes with its commit message", async () => {
    const bare = tmp("stage-local-origin-");
    sh(bare, "init", "-q", "--bare", "-b", "main");
    const repo = tmp("stage-local-ig-repo-");
    sh(repo, "init", "-q", "-b", "main");
    sh(repo, "config", "user.name", "t");
    sh(repo, "config", "user.email", "t@example.org");
    sh(repo, "remote", "add", "origin", "https://github.com/o/r");
    sh(repo, "config", `url.file://${bare}.insteadOf`, "https://github.com/o/r");
    put(repo, ".github/workflows/fhirbuild.yml", IG_CALLER.replace("WorldHealthOrganization/smart-base", "o/sb"));
    sh(repo, "add", "-A");
    sh(repo, "commit", "-q", "-m", "ig");
    sh(repo, "push", "-q", "origin", "main");

    // gh-pages already holds another branch's build and a stale root page.
    const seed = tmp("stage-local-seed-");
    sh(seed, "init", "-q", "-b", "gh-pages");
    put(seed, "branches/other/index.html", "other");
    put(seed, "stale.html", "stale");
    sh(seed, "add", "-A");
    sh(seed, "-c", "user.name=t", "-c", "user.email=t@example.org", "commit", "-q", "-m", "seed");
    sh(seed, "push", "-q", `file://${bare}`, "gh-pages");

    // The reusable workflows, as a local checkout: fhirbuild.yml deploys nothing, ghbuild.yml is the Pages build.
    const src = tmp("stage-local-wfsrc-");
    put(src, ".github/workflows/fhirbuild.yml", "on:\n  workflow_call:\njobs:\n  trigger:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo trigger\n");
    put(src, ".github/workflows/ghbuild.yml", `on:
  workflow_call:
    inputs:
      deploy:
        type: boolean
        default: true
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Get branch name
        env:
          GH_REF_NAME: \${{ github.ref_name }}
        run: echo "BRANCH_DIR=\${GH_REF_NAME##*/}" >> "$GITHUB_ENV"
      - name: Default branch
        run: |
          D=$(git remote show origin | sed -n '/HEAD branch/s/.*: //p')
          if [ "$GITHUB_REF_NAME" = "$D" ]; then echo "IS_DEFAULT_BRANCH=true" >> $GITHUB_ENV; else echo "IS_DEFAULT_BRANCH=false" >> $GITHUB_ENV; fi
      - name: Build
        run: mkdir -p output && echo "$GITHUB_SHA" > output/index.html
${IG_WORKFLOW.slice(IG_WORKFLOW.indexOf("      - name: Deploy candidate\n"), IG_WORKFLOW.indexOf("      - name: Commit README.md"))}`);

    const quiet = () => {};
    sh(repo, "checkout", "-q", "-b", "claude/feat");
    const dry = await stageLocal({ repo, workflowSource: src, dryRun: true, log: quiet });
    expect(dry).toMatchObject({ kind: "ig", target: "preview", pushed: false });
    expect(dry.composed).toMatch(/1 file changed/);
    expect(sh(bare, "log", "-1", "--format=%s", "gh-pages")).toBe("seed");

    const pre = await stageLocal({ repo, workflowSource: src, log: quiet });
    expect(pre).toMatchObject({ kind: "ig", target: "preview", pushed: true, url: "https://o.github.io/r/branches/feat/" });
    expect(sh(bare, "log", "-1", "--format=%s", "gh-pages")).toBe("Deploy candidate branch");
    expect(sh(bare, "show", "gh-pages:branches/feat/index.html")).toBe(sh(repo, "rev-parse", "HEAD"));
    expect(sh(bare, "show", "gh-pages:branches/other/index.html")).toBe("other");
    expect(sh(bare, "show", "gh-pages:stale.html")).toBe("stale");

    sh(repo, "checkout", "-q", "main");
    const main = await stageLocal({ repo, workflowSource: src, log: quiet });
    expect(main).toMatchObject({ kind: "ig", target: "main", pushed: true, url: "https://o.github.io/r/" });
    expect(sh(bare, "log", "-1", "--format=%s", "gh-pages")).toBe("Deploy main branch");
    expect(sh(bare, "log", "-1", "--format=%b", "gh-pages")).toContain(`from ${sh(repo, "rev-parse", "HEAD")}`);
    const root = sh(bare, "ls-tree", "--name-only", "gh-pages").split("\n");
    expect(root.sort()).toEqual(["branches", "index.html"]);
    expect(sh(bare, "show", "gh-pages:branches/feat/index.html")).toBeTruthy();
    // Never a force push: the seed is still in the branch's history.
    expect(sh(bare, "log", "--format=%s", "gh-pages")).toContain("seed");
  }, 60_000);
});
