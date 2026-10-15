/**
 * `derive:publish` runs an instance's publish-time writers BEFORE those of the
 * instances it `needs` — consumers first.
 *
 * A `checkout` artefact is computed over the instances above the one serving
 * it (B1, `schemas/built-at-publish.ts` in cat-harness), so when one of those
 * builds part of its own tree at publish, the artefact below must be written
 * after it. The case that failed (2026-10-15): cat-harness's
 * `docs/_data/harness.json` (`docs:harness`) links smart-trust as a folio, with
 * a rail scope, only when `smart-trust/docs/` exists, and that directory is
 * smart-trust's own publish-time artefact (`smart-trust:pages`). In the
 * index's listing order cat-harness ran first, so one clean build wrote the
 * platform data without smart-trust's rail scope, and
 * `foreign-site-scope.test.ts` passed or failed with whichever concurrent
 * build reached `smart-trust:pages` first.
 *
 * The fixture lists the lower instance FIRST in directory order, the order
 * the old plan followed, so a plan that ignored `needs` fails here.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { declaredPlan, writersOf, writingOrder } from "../derive-at-publish.ts";

let tmp: string;

function instance(name: string, needs: string[], builtAtPublish: { path: string; writer: string[]; because: "checkout" | "state" }[]): void {
  const p = join(tmp, name, `${name}.json`);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify({ name, needs, builtAtPublish: builtAtPublish.map((e) => ({ ...e, reason: "fixture" })) }));
}

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "derive-order-"));
  // `a-platform` sorts first and is the one the others stand on, as cat-harness
  // is listed first in the index and stands below smart-trust.
  instance("a-platform", [], [
    { path: "docs/_data/harness.json", writer: ["platform:pages", "platform:harness"], because: "checkout" },
    { path: "docs/other/", writer: ["platform:other"], because: "checkout" },
  ]);
  instance("b-ig", ["c-base"], [
    { path: "ns/context/v1.jsonld", writer: ["shared:contexts"], because: "checkout" },
    { path: "docs/", writer: ["ig:pages"], because: "checkout" },
  ]);
  instance("c-base", ["a-platform"], [{ path: "ns/context/v1.jsonld", writer: ["shared:contexts"], because: "checkout" }]);
});

afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe("publish-time writers run consumers first", () => {
  test("every instance comes before each instance it needs", () => {
    const order = writingOrder(tmp);
    expect(order.indexOf("b-ig")).toBeLessThan(order.indexOf("c-base"));
    expect(order.indexOf("c-base")).toBeLessThan(order.indexOf("a-platform"));
  });

  test("the IG's pages are written before the platform data that reads whether they exist", () => {
    const writers = writersOf(declaredPlan(tmp));
    expect(writers.indexOf("ig:pages")).toBeLessThan(writers.indexOf("platform:harness"));
  });

  test("an instance's own entries keep their declared order, and a shared writer runs once", () => {
    expect(writersOf(declaredPlan(tmp))).toEqual(["shared:contexts", "ig:pages", "platform:pages", "platform:harness", "platform:other"]);
  });
});
