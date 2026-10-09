/**
 * The tests of this file that read the whole checkout (reads every instance
 * this checkout stages and the repository each declares) live in
 * `test/instance-repositories-checkout.test.ts` (bean `7zz1`): standing alone,
 * cat-harness has none of it.
 */
import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { CatHarnessDeclarationSchema } from "@litlfred/cat-harness/schemas/cat-harness.ts";
import { gitCorpus } from "@litlfred/cat-harness/schemas/git-corpus.ts";
import { instanceRepositories } from "@litlfred/cat-harness/schemas/instance-repositories.ts";
import { notApplicableAlone } from "../test/support/checkout";
import { HARNESS_ROOT } from "../scripts/lib/roots.ts";
import { dirname } from "node:path";

const CHECKOUT = resolve(dirname(HARNESS_ROOT));

// The references are those of every instance a COMPOSED checkout stages,
// read from its corpus. Standing alone, cat-harness's checkout is its own
// clone and holds none of the others, so these are not applicable there.
const COMPOSED_ABSENT = notApplicableAlone(
  "the voice and instance declarations of every instance a composed checkout stages",
);

describe.skipIf(COMPOSED_ABSENT)("instance references are owner/repo and resolve (bean 6rmv, phase 2)", () => {
  const map = instanceRepositories(CHECKOUT);
  // Every committed voice and instance declaration — the files whose
  // `instance` fields name another instance. Read through `gitCorpus`, not a
  // bare `git ls-files`: in the index checkout every instance is a REMOTE
  // MOUNT, ignored by the index's git, so `ls-files` listed none of them and
  // this set came back empty. The corpus counts a mount's files as a
  // submodule's were.
  const files = (gitCorpus(CHECKOUT) ?? [])
    .map((abs) => relative(CHECKOUT, abs))
    .filter((f) => f.endsWith("voice.json") || /^([^/]+)\/\1\.json$/.test(f));
  const refs: Array<{ file: string; ref: string }> = [];
  for (const file of files) {
    for (const m of readFileSync(join(CHECKOUT, file), "utf8").matchAll(/"instance":\s*"([^"]+)"/g)) {
      refs.push({ file, ref: m[1]! });
    }
  }

  test("there are references to check", () => {
    expect(refs.length).toBeGreaterThan(100);
  });

  test("every one resolves through the derived map, by owner/repo", () => {
    expect(refs.filter(({ ref }) => !map.byRepository.has(ref))).toEqual([]);
  });
});

describe("instance repositories — the schema and the refusals", () => {
  const base = { name: "x", title: "X", version: "0.1.0", directories: [] };

  test("repository must be owner/name; livesAt path may not climb", () => {
    expect(CatHarnessDeclarationSchema.safeParse({ ...base, repository: "x" }).success).toBe(false);
    expect(
      CatHarnessDeclarationSchema.safeParse({ ...base, livesAt: { repository: "a/b", path: "../x" } }).success,
    ).toBe(false);
    expect(
      CatHarnessDeclarationSchema.safeParse({ ...base, repository: "a/x", livesAt: { repository: "a/b", path: "x" } })
        .success,
    ).toBe(true);
  });

  test("two instances claiming one repository is refused", () => {
    const dir = mkdtempSync(join(tmpdir(), "inst-repo-"));
    for (const n of ["one", "two"]) {
      mkdirSync(join(dir, n));
      writeFileSync(
        join(dir, n, `${n}.json`),
        JSON.stringify({ name: n, version: "0.1.0", repository: "o/same", directories: [] }),
      );
    }
    expect(() => instanceRepositories(dir)).toThrow(/o\/same is declared by both/);
  });
});
