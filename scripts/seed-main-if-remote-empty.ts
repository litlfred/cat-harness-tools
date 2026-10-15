#!/usr/bin/env bun
/**
 * When `origin` is an EMPTY repository, put `main` on it before anything else
 * is pushed, without switching the branch the caller is on.
 *
 * GitHub makes the first branch pushed to an empty repository its default.
 * `litlfred/dth-hrh` was created empty and scaffolded by `init-folio
 * --skip-vcs` in a cloud checkout on a feature branch; `--skip-vcs` skipped
 * `seedMainIfEmpty`, the feature branch was pushed first, and it became the
 * default instead of `main` (owner, 2026-10-14). So `init-folio` calls this
 * whenever it does not link the platform itself, and it can be run by hand:
 *
 *   bun run cat-harness-tools/scripts/seed-main-if-remote-empty.ts [<checkout>]
 *
 * It costs one `ls-remote` when the remote has branches. The session-start
 * primer does not run it (a repository that has the hook has been pushed
 * already); it WARNS instead when the remote's default is not `main`.
 *
 * Three rules a caller can rely on:
 *
 * - **It never fails its caller.** Every outcome exits 0. A guard that blocks
 *   the session over a remote it could not reach has made a small risk into
 *   an outage.
 * - **It never force-pushes.** `main` is pushed with a plain push, so a remote
 *   that gained a `main` between the question and the push refuses it.
 * - **It does nothing when the remote has any branch**, or when the remote
 *   could not be asked. An empty answer is the only answer that seeds.
 *
 * WHICH commit becomes `main` depends on the checkout:
 *
 * - **No commits yet.** An EMPTY "Seed main" commit, as `seedMainIfEmpty`
 *   makes, and the branch HEAD names is pointed at it too, so the session's
 *   first commit sits on top of `main` rather than beginning a history of its
 *   own. Plumbing (`commit-tree`, `update-ref`) rather than `commit`, so the
 *   index and working tree are left exactly as the session had them.
 * - **Commits already, on a feature branch** — the dth-hrh case. `main` is the
 *   ROOT commit of HEAD. An empty seed commit would be a second root: the
 *   feature branch shares no history with it, GitHub cannot open a pull
 *   request between them, and the only way to base the branch on the seed is
 *   to rewrite commits that may already be pushed, which needs the force-push
 *   this guard is forbidden. The root keeps ONE root and makes the feature
 *   branch a descendant of `main`, so its pull request shows every commit
 *   after the first. The cost is that the first commit lands on `main`
 *   without review; when the branch has only that one commit, its pull
 *   request is empty. That is reported, not hidden.
 * - **A local `main` already**: that is what is pushed. It is the history the
 *   person called `main`, and the guard has no grounds to choose another.
 *
 * A HEAD with more than one root (unrelated histories merged) has no single
 * answer and is reported, not seeded.
 *
 * @module cat-harness-tools/scripts/seed-main-if-remote-empty
 */
import { git, remoteState } from "./lib/empty-remote.ts";

export type RemoteSeedOutcome =
  | { kind: "no-origin" }
  | { kind: "remote-has-branches" }
  | { kind: "seeded"; from: "empty-seed" | "root-commit" | "local-main"; sha: string; note?: string }
  | { kind: "stopped"; reason: string };

/** The empty tree, by hash: the same in every SHA-1 repository. */
const EMPTY_TREE_SHA1 = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

export function seedRemoteMainIfEmpty(root: string, opts: { timeout?: number } = {}): RemoteSeedOutcome {
  const remote = remoteState(root, opts.timeout ?? 15_000);
  if (remote.kind === "no-origin") return { kind: "no-origin" };
  if (remote.kind === "has-branches") return { kind: "remote-has-branches" };
  if (remote.kind === "unknown") return { kind: "stopped", reason: `could not ask origin whether it is empty (${remote.reason}); not seeding` };

  let sha: string;
  let from: "empty-seed" | "root-commit" | "local-main";
  let note: string | undefined;
  const localMain = git(root, ["rev-parse", "--verify", "--quiet", "refs/heads/main^{commit}"]);
  const head = git(root, ["rev-parse", "--verify", "--quiet", "HEAD^{commit}"]);

  if (localMain.ok) {
    sha = localMain.out;
    from = "local-main";
  } else if (head.ok) {
    const roots = git(root, ["rev-list", "--max-parents=0", "HEAD"]);
    const list = roots.out.split(/\s+/).filter(Boolean);
    if (!roots.ok || list.length !== 1) return { kind: "stopped", reason: `HEAD has ${list.length || "no readable"} root commits; no single commit to push as main` };
    sha = list[0]!;
    from = "root-commit";
    if (sha === head.out) note = "HEAD is its own root, so main now equals this branch and its pull request will be empty";
    // A local `main` too, so `git log main..` and a later PR read the same.
    git(root, ["update-ref", "refs/heads/main", sha, ""]);
  } else {
    const tree = git(root, ["hash-object", "-t", "tree", "/dev/null"]);
    const seed = git(root, ["-c", "commit.gpgsign=false", "commit-tree", tree.ok ? tree.out : EMPTY_TREE_SHA1, "-m", "Seed main"]);
    if (!seed.ok) return { kind: "stopped", reason: `the seed commit failed (${seed.err.slice(0, 200) || "unknown error"}); often an unset user.name / user.email` };
    sha = seed.out;
    from = "empty-seed";
    if (!git(root, ["update-ref", "refs/heads/main", sha, ""]).ok) return { kind: "stopped", reason: "could not create the local main ref" };
    const current = git(root, ["symbolic-ref", "--quiet", "HEAD"]);
    if (current.ok && current.out !== "refs/heads/main") git(root, ["update-ref", current.out, sha, ""]);
  }

  const push = git(root, ["push", "--quiet", "origin", `${sha}:refs/heads/main`], opts.timeout ?? 60_000);
  if (!push.ok) return { kind: "stopped", reason: `could not push main (${push.err.slice(0, 200) || "unknown error"})` };
  return note ? { kind: "seeded", from, sha, note } : { kind: "seeded", from, sha };
}

/** The markdown the primer prints: nothing in the ordinary case. */
export function formatRemoteSeed(r: RemoteSeedOutcome): string {
  if (r.kind === "no-origin" || r.kind === "remote-has-branches") return "";
  if (r.kind === "stopped") {
    return [
      "## origin may be empty, and main was not seeded",
      "",
      `- ${r.reason}.`,
      "- GitHub makes the first branch pushed to an empty repository its default.",
      "  Push `main` (or run `init-folio`) before any feature branch.",
      "",
    ].join("\n");
  }
  const what = { "empty-seed": "an empty \"Seed main\" commit", "root-commit": "this branch's root commit", "local-main": "the local main" }[r.from];
  return [
    "## origin was empty: main was seeded",
    "",
    `- Pushed ${what} (\`${r.sha.slice(0, 12)}\`) as \`main\`, so GitHub takes \`main\` as the default branch.`,
    ...(r.note ? [`- ${r.note}.`] : []),
    "",
  ].join("\n");
}

if (import.meta.main) {
  try {
    const root = process.argv[2] ?? process.cwd();
    const out = formatRemoteSeed(seedRemoteMainIfEmpty(root));
    if (out) process.stdout.write(out + "\n");
  } catch {
    // Never fail the session.
  }
  process.exit(0);
}
