import { describe, expect, test } from "bun:test";
import { BuildingBlocksSchema, parseUserScenario, UserScenarioSchema, UserScenarioV01Schema } from "./user-scenario";

const step = { id: "J1", title: "Born abroad", lead: "mother", experiences: [{ actor: "mother", doing: "holds the cards", emotion: 1 }] };
const v01 = { $schema: "user-scenario/0.1.0", id: "j1", title: "J1", description: "d", personas: ["mother"], steps: [step] };

describe("user-scenario: the draft family is read unchanged, 0.2.0 adds to it", () => {
  test("a 0.1.0 file parses as it is, by the draft's own shape and by the kind", () => {
    expect(UserScenarioV01Schema.safeParse(v01).success).toBe(true);
    expect(UserScenarioV01Schema.safeParse({ ...v01, partOf: "j" }).success).toBe(false);
    expect(UserScenarioSchema.safeParse(v01).success).toBe(true);
  });
  test("the kind refuses a newer minor and another major", () => {
    expect(UserScenarioSchema.safeParse({ ...v01, $schema: "user-scenario/0.3.0" }).success).toBe(false);
    expect(UserScenarioSchema.safeParse({ ...v01, $schema: "user-scenario/1.0.0" }).success).toBe(false);
  });
  test("0.2.0 groups (partOf, no steps) and carries gaps and views", () => {
    const group = { ...v01, $schema: "user-scenario/0.2.0", id: "j", steps: [] };
    expect(UserScenarioSchema.safeParse(group).success).toBe(true);
    const child = { ...v01, $schema: "user-scenario/0.2.0", partOf: "j", views: [{ model: "0.1.0", view: "id-1" }], steps: [{ ...step, gaps: ["not yet"] }] };
    expect(parseUserScenario(child).steps[0]).toMatchObject({ gaps: ["not yet"] });
  });
  test("a step id twice, an actor not among the personas, and an unknown key are refused", () => {
    expect(() => parseUserScenario({ ...v01, steps: [step, step] })).toThrow(/appears twice/);
    expect(() => parseUserScenario({ ...v01, steps: [{ ...step, lead: "stranger" }] })).toThrow(/not among the scenario's personas/);
    expect(() => parseUserScenario({ ...v01, steps: [{ ...step, mood: 1 }] })).toThrow();
  });
  test("an emotion outside -2..2 is refused", () => {
    expect(() => parseUserScenario({ ...v01, steps: [{ ...step, experiences: [{ actor: "mother", doing: "x", emotion: 3 }] }] })).toThrow();
  });
});

describe("building-blocks: a block is in a declared layer, once", () => {
  const block = { id: "sdk", name: "SDK", kind: "tool", layer: "apps", jurisdiction: "International", what: "w" };
  test("valid catalogue", () => {
    expect(BuildingBlocksSchema.safeParse({ $schema: "building-blocks/0.1.0", layers: [{ id: "apps", label: "Apps" }], blocks: [block] }).success).toBe(true);
  });
  test("an unknown layer and a duplicate id are refused", () => {
    expect(BuildingBlocksSchema.safeParse({ $schema: "building-blocks/0.1.0", layers: [{ id: "data", label: "Data" }], blocks: [block] }).success).toBe(false);
    expect(BuildingBlocksSchema.safeParse({ $schema: "building-blocks/0.1.0", layers: [{ id: "apps", label: "Apps" }], blocks: [block, block] }).success).toBe(false);
  });
});
