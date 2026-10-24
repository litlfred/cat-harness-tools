/**
 * Folio Assistant — who is typing, as a (provider, handle) pair, from every
 * source a session can see. Bean `folio-assistant-f1e1`.
 *
 * Owner ruling 2026-10-10: *"provider-neutral: identity is (provider, handle),
 * GitHub implemented first; preferences that are not repo content live in a
 * user-level config store."* Until this module, the only key was a GitHub
 * login (`github-auth.ts`), so a local CLI with no token, another forge, or no
 * forge at all fell straight to "could not determine".
 *
 * ## What each provider vouches for
 *
 * Not every source is equally strong, and the pair says which one spoke:
 *
 * | provider | from | vouched by |
 * |---|---|---|
 * | `github` | {@link githubIdentity}: a token's `GET /user`, or `GITHUB_ACTOR` in Actions | GitHub |
 * | `gitlab` | `GITLAB_USER_LOGIN`, set by GitLab CI for the user who started the pipeline | GitLab, in CI only |
 * | `claude` | `CLAUDE_CODE_USER_EMAIL`, the agent host's signed-in account | the agent host |
 * | any | `CAT_HARNESS_PERSON`: `provider:handle`, comma-separated | nobody: self-asserted, per session |
 * | `git` | `git config user.email`, then `user.name` | nobody: self-asserted |
 * | any | the user-level config's `identities` | nobody: self-asserted, per machine |
 *
 * A self-asserted identity is good enough to choose how to TALK to someone,
 * which is what the interaction preferences are for. It is never good enough
 * to AUTHORIZE them: permissions stay with {@link principalFromGithub}, which
 * accepts only what GitHub vouched for. `vouched` carries that difference, so
 * one resolver can feed both preferences and permissions without confusing them.
 *
 * ## The user-level store
 *
 * `$XDG_CONFIG_HOME/cat-harness/identity.json` (default `~/.config/…`; the
 * `CAT_HARNESS_USER_CONFIG` variable overrides the path). It is per-machine and
 * never committed: it holds identities a person declares for themselves and
 * preferences that are not repository content (owner ruling, above). A missing
 * file is the normal case and reads as empty; an unreadable one is reported,
 * never silently treated as empty.
 *
 * ## Several people, several accounts, several hosts
 *
 * One machine shared by several people: each has their own home directory,
 * so each has their own user-level store. One session shared, or a shared
 * login: `CAT_HARNESS_PERSON` names who is typing for this session only, and
 * is put first among the self-asserted answers. One person with several
 * accounts on a provider: list each in the store; every one is a match key.
 * When the keys match more than one person on record, the reader applies the
 * strictest of their profiles, never the first one found.
 *
 * Which agent host runs the session is reported too ({@link detectAgentHosts}).
 * A host that passes no account to a command gets a note saying so, so "nobody
 * vouched" reads as a property of the host and not as a fault.
 *
 * @module folio-assistant/core/identity
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { detectAgentHosts, type AgentHost } from "./agent-host.js";
import { githubIdentity, type GithubIdentity } from "./github-auth.js";

type Env = Readonly<Record<string, string | undefined>>;

/** One identity a session can see. */
export interface Identity {
  /** `github`, `gitlab`, `claude`, `git`, or a provider a user config names. */
  provider: string;
  handle: string;
  /** Where it was read. */
  via: string;
  /** Whether the provider itself vouched for it, rather than the person asserting it. */
  vouched: boolean;
}

/** The user-level store's shape. Unknown keys are kept for the caller. */
export interface UserIdentityConfig {
  identities?: { provider: string; handle: string }[];
  /** Interaction preferences that are not repository content. */
  interaction?: Record<string, unknown>;
  [k: string]: unknown;
}

export type UserConfigRead =
  | { state: "absent"; path: string }
  | { state: "ok"; path: string; config: UserIdentityConfig }
  | { state: "unreadable"; path: string; reason: string };

/** Where the user-level store lives for this environment. */
export function userConfigPath(env: Env, home: string = homedir()): string {
  if (env.CAT_HARNESS_USER_CONFIG) return env.CAT_HARNESS_USER_CONFIG;
  const base = env.XDG_CONFIG_HOME || join(home, ".config");
  return join(base, "cat-harness", "identity.json");
}

/** Read the user-level store: absent, ok, or unreadable — never a silent empty. */
export function readUserConfig(env: Env, home?: string): UserConfigRead {
  const path = userConfigPath(env, home);
  if (!existsSync(path)) return { state: "absent", path };
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return { state: "unreadable", path, reason: "not a JSON object" };
    }
    const config = parsed as UserIdentityConfig;
    if (config.identities !== undefined) {
      const bad = !Array.isArray(config.identities) ||
        config.identities.some((i) => typeof i?.provider !== "string" || typeof i?.handle !== "string" || !i.provider || !i.handle);
      if (bad) return { state: "unreadable", path, reason: "`identities` must be a list of {provider, handle} strings" };
    }
    return { state: "ok", path, config };
  } catch (e) {
    return { state: "unreadable", path, reason: e instanceof Error ? e.message : String(e) };
  }
}

/** `provider:handle`, the form an interaction entry's alias may take. */
export function qualified(id: Pick<Identity, "provider" | "handle">): string {
  return `${id.provider}:${id.handle}`;
}

export interface IdentityResolution {
  identities: Identity[];
  /** The GitHub resolver's own answer, kept whole: permissions read it. */
  github: GithubIdentity;
  userConfig: UserConfigRead;
  /** The agent hosts whose markers are set: usually one, none outside an agent. */
  hosts: AgentHost[];
  /** Sources that were asked and could not answer, in words. */
  notes: string[];
}

function gitConfig(key: string, cwd?: string): string | undefined {
  try {
    const v = execFileSync("git", ["config", key], { cwd, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return v || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Every identity this session can see, strongest first, de-duplicated by
 * (provider, handle). `github` is resolved by {@link githubIdentity} — the
 * same answer `auth_whoami` gives — and the rest are read from the
 * environment, git, and the user-level store.
 */
export async function resolveIdentities(opts: {
  env: Env;
  repo?: string;
  cwd?: string;
  home?: string;
  fetch?: Parameters<typeof githubIdentity>[0]["fetch"];
  /** Injected for tests; default reads `git config`. */
  git?: (key: string) => string | undefined;
}): Promise<IdentityResolution> {
  const { env } = opts;
  const git = opts.git ?? ((k: string) => gitConfig(k, opts.cwd));
  const out: Identity[] = [];
  const notes: string[] = [];
  const add = (i: Identity) => {
    if (!out.some((o) => o.provider === i.provider && o.handle === i.handle)) out.push(i);
  };

  const github = await githubIdentity({ env, repo: opts.repo, fetch: opts.fetch });
  if (github.login) add({ provider: "github", handle: github.login, via: github.via === "actions" ? "GITHUB_ACTOR" : "token", vouched: true });
  else notes.push(`github: ${github.reason ?? github.status}`);

  if (env.GITLAB_CI === "true" && env.GITLAB_USER_LOGIN) {
    add({ provider: "gitlab", handle: env.GITLAB_USER_LOGIN, via: "GITLAB_USER_LOGIN", vouched: true });
  }
  if (env.CLAUDE_CODE_USER_EMAIL) add({ provider: "claude", handle: env.CLAUDE_CODE_USER_EMAIL, via: "CLAUDE_CODE_USER_EMAIL", vouched: true });

  const person = parsePersons(env.CAT_HARNESS_PERSON);
  for (const i of person.ok) add({ ...i, via: "CAT_HARNESS_PERSON", vouched: false });
  for (const bad of person.bad) notes.push(`CAT_HARNESS_PERSON: \`${bad}\` is not provider:handle`);

  const userConfig = readUserConfig(env, opts.home);
  if (userConfig.state === "ok") {
    for (const i of userConfig.config.identities ?? []) add({ provider: i.provider, handle: i.handle, via: userConfig.path, vouched: false });
  } else if (userConfig.state === "unreadable") {
    notes.push(`user config ${userConfig.path}: ${userConfig.reason}`);
  }

  const email = git("user.email");
  const name = git("user.name");
  if (email) add({ provider: "git", handle: email, via: "git config user.email", vouched: false });
  if (name) add({ provider: "git", handle: name, via: "git config user.name", vouched: false });

  const hosts = detectAgentHosts(env);
  for (const h of hosts.filter((h) => !h.exposesIdentity)) {
    notes.push(`${h.id}: the host passes no account to a command; who is typing comes from a forge token, CAT_HARNESS_PERSON, ${userConfigPath(env, opts.home)} or the git author`);
  }

  return { identities: out, github, userConfig, hosts, notes };
}

/** `CAT_HARNESS_PERSON`: `provider:handle[,provider:handle…]`, blanks ignored. */
export function parsePersons(value: string | undefined): { ok: { provider: string; handle: string }[]; bad: string[] } {
  const ok: { provider: string; handle: string }[] = [];
  const bad: string[] = [];
  for (const part of (value ?? "").split(",").map((p) => p.trim()).filter(Boolean)) {
    const at = part.indexOf(":");
    if (at > 0 && at < part.length - 1) ok.push({ provider: part.slice(0, at), handle: part.slice(at + 1) });
    else bad.push(part);
  }
  return { ok, bad };
}

/**
 * The strings an interaction entry is matched against: each handle bare (the
 * key form `interaction.json` has always used) and qualified as
 * `provider:handle` (the provider-neutral alias form).
 */
export function matchKeys(identities: readonly Identity[]): string[] {
  const keys = new Set<string>();
  for (const i of identities) {
    keys.add(i.handle);
    keys.add(qualified(i));
  }
  return [...keys];
}
