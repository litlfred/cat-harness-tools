/**
 * `instance-repositories` tests about the WHOLE CHECKOUT, moved here from
 * `cat-harness/schemas/instance-repositories.test.ts` (bean `7zz1`, owner
 * ruling 2026-10-06 "Top-level instance"): each reads every instance this
 * checkout stages and the repository each declares, which only the checkout
 * holds. Standing alone, cat-harness has none of it, and
 * `check:cat-harness-standalone` collects every test in that layer. The rest
 * of that file's tests stay there; every path here is composed from
 * ORIGIN_DIR, the directory they were written in, so nothing they read
 * changed.
 */
import { describe, expect, test } from "bun:test";
import { join, resolve } from "node:path";
import { instanceRepositories, locationMismatch, repositoryNamespaces, resolveInstance } from "../../../cat-harness/schemas/instance-repositories";
import { ownNamespace } from "../../../cat-harness/schemas/namespaces";

/** The directory these tests were written in (`cat-harness/schemas/`): every path below is composed from it exactly as it was before the move, so nothing they read changed. */
const ORIGIN_DIR = join(import.meta.dir, "../../../cat-harness/schemas");

const CHECKOUT = resolve(ORIGIN_DIR, "../..");

describe("instance repositories — this checkout (bean 6rmv)", () => {
  const map = instanceRepositories(CHECKOUT);

  test("every instance declares the repository it is", () => {
    expect(map.undeclared).toEqual([]);
    expect(map.entries.length).toBeGreaterThan(1);
  });

  test("livesAt matches where each instance actually sits", () => {
    expect(map.entries.map((e) => locationMismatch(e, CHECKOUT)).filter(Boolean)).toEqual([]);
  });

  test("every livesAt names the checkout's own repository as host", () => {
    // This compared each `livesAt` with the repository of the instance AT the
    // checkout root. RESTATED 2026-10-09: the owner removed that declaration
    // on 2026-10-08 (3d4caf6, "should not need folio-assistant declared at
    // all"), so the checkout root is an index and declares no repository of
    // its own. What still holds, and is what the comparison was for: every
    // `livesAt` names ONE host, and that host is the checkout itself -- the
    // repository no instance in it IS. A `livesAt` naming one of the mounted
    // instances' repositories, or two different hosts, fails exactly as a
    // mismatch against the root instance did.
    expect(map.entries.some((e) => resolve(e.root) === CHECKOUT)).toBe(false);
    const hosts = new Set(map.entries.flatMap((e) => (e.livesAt ? [e.livesAt.repository] : [])));
    expect(hosts.size).toBe(1);
    const own = new Set(map.entries.map((e) => e.repository));
    expect([...hosts].filter((h) => own.has(h))).toEqual([]);
  });

  test("a reference resolves by owner/repo and, transitionally, by name", () => {
    const e = map.byName.get("cat-harness")!;
    expect(resolveInstance(map, e.repository)?.root).toBe(e.root);
    expect(resolveInstance(map, "cat-harness")?.repository).toBe(e.repository);
    expect(resolveInstance(map, "nobody/nothing")).toBeUndefined();
  });
});

describe("the owner/repo → namespace map is derived and agrees with the list (bean 6rmv, phase 3)", () => {
  const ns = repositoryNamespaces(CHECKOUT);

  test("every declared instance has a namespace", () => {
    expect(ns.size).toBe(instanceRepositories(CHECKOUT).entries.length);
  });

  // The code list still NAMES each vocabulary namespace, because code reads
  // them by code; what it may no longer do is SPELL one differently from the
  // declaration it belongs to. Code → the repository whose namespace it is.
  const LISTED: Array<[code: string, repository: string]> = [
    ["cat-bootstrap", "litlfred/bootstrap"],
    ["cat-harness", "litlfred/cat-harness"],
    ["folio-assistant-core", "litlfred/folio-assistant-core"],
  ];
  test.each(LISTED)("own-namespaces %s is what %s's declaration derives", (code, repository) => {
    expect(ns.get(repository)).toBe(ownNamespace(code));
  });
});
