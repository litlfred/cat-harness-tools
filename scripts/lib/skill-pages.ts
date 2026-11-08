/**
 * Which skills have a published instruction page, and the link to one.
 *
 * Bean `qgjh`: "emit links wherever the target resolves". Visualisers printed
 * skill ids as code although the page existed. The page set is READ from the
 * directory `gen-skill-docs.ts` writes, never composed from an id, so a link
 * is emitted only where a page is and a skill without one stays code rather
 * than becoming a link that 404s.
 *
 * ONE answer for every visualiser. Two generators deriving it separately is
 * how one page links a skill another shows as code.
 */
import { existsSync, readdirSync } from "node:fs";
import { basename, join, posix, relative, sep } from "node:path";
import { baseDocsDir } from "../compose-docs.js";
import { isSkillMd, skillMdDirs } from "../known-skills.ts";
import { blobUrl, forgeAt } from "./library-source.ts";
import { repoOf } from "../../src/core/edit-links.ts";
import { detectRepoUrl } from "../../src/core/git-refs.ts";

/** Where the instruction pages sit, relative to the base docs layer. */
export const SKILL_PAGES_DIR = "reference/skill-instructions";

/** The base docs layer, the same answer `compose-docs.ts` uses. */

/** The skills with a generated instruction page. */
export function skillPagesOf(repo: string): ReadonlySet<string> {
  const dir = join(baseDocsDir(repo), SKILL_PAGES_DIR);
  return new Set(existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".md")).map((f) => basename(f, ".md")) : []);
}

/**
 * The href from a page at `fromPage` (relative to the base docs layer, e.g.
 * `tools/index.md`) to `skill`'s instruction page, or `undefined` when the
 * skill has none.
 */
export function skillPageHref(skill: string, fromPage: string, pages: ReadonlySet<string>): string | undefined {
  if (!pages.has(skill)) return undefined;
  return posix.relative(posix.dirname(fromPage.split("\\").join("/")), `${SKILL_PAGES_DIR}/${skill}.html`);
}


/**
 * The skills with an instruction page, plus where to read each skill that has
 * none: its source file on the forge.
 *
 * Owner, 2026-11-08 (`A_ListHarnesses` on the `discussion` process page):
 * "confirm-harness is not a link to skill … it should be". bootstrap's skills
 * get no instruction page on this site, by ruling (`pve3` in
 * `gen-skill-docs.ts`), so the panel showed them as code with "no page for
 * this one". Their source file IS a page, in bootstrap's own repository, and
 * linking it publishes nothing of bootstrap's here.
 */
export type SkillPages = ReadonlySet<string> & {
  /** skill → its source file's URL on the forge, for a skill with no instruction page. */
  readonly sources?: ReadonlyMap<string, string>;
};

/**
 * skill name → its source file's URL, over every skill file `roots` declare.
 * The first root to hold a name wins, as for `skillEdgeIndex`. A file the
 * forge cannot place (no mount, no origin) is left out, so no wrong link is drawn.
 */
export function skillSourcesOf(repo: string, roots: readonly string[]): Map<string, string> {
  const out = new Map<string, string>();
  const checkoutRepo = repoOf(detectRepoUrl(repo), "") || undefined;
  for (const root of roots) {
    let dirs: string[][];
    try {
      dirs = skillMdDirs(root);
    } catch {
      continue;
    }
    for (const parts of dirs) {
      const dir = join(root, ...parts);
      if (!existsSync(dir)) continue;
      for (const f of readdirSync(dir).sort()) {
        const abs = join(dir, f);
        const name = f.slice(0, -3);
        if (!f.endsWith(".md") || out.has(name) || !isSkillMd(abs)) continue;
        const at = forgeAt(repo, relative(repo, abs).split(sep).join("/"), checkoutRepo);
        if (at) out.set(name, blobUrl(at));
      }
    }
  }
  return out;
}

/** {@link skillPagesOf}, carrying {@link skillSourcesOf} for the skills it lacks. */
export function skillLinksOf(repo: string, roots: readonly string[]): SkillPages {
  const pages = skillPagesOf(repo);
  const sources = new Map([...skillSourcesOf(repo, roots)].filter(([n]) => !pages.has(n)));
  return Object.assign(new Set(pages), { sources });
}

/**
 * Where `skill` links from a page whose site root is `root` (`../../` and so
 * on): its instruction page when it has one, else its source file, else
 * nothing — code, never a guessed link.
 */
export function skillTarget(skill: string, root: string, pages: SkillPages): string | undefined {
  return pages.has(skill) ? `${root}${SKILL_PAGES_DIR}/${skill}.html` : pages.sources?.get(skill);
}
