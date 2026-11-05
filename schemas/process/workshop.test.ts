import { describe, expect, test } from "bun:test";
import { parseWorkshop } from "./workshop";

const base = {
  $schema: "workshop/0.1.0",
  id: "w",
  title: "W",
  description: "d",
  scenarios: ["j1"],
  modules: [{ id: "M1", title: "One", sheet: "s1", tables: ["rights"] }],
  tables: [{ id: "rights", title: "Rights", rows: [{ id: "anchor", label: "Trust anchor" }] }],
  sheets: [{ id: "s1", title: "Sheet", modules: ["M1"] }],
  steps: [{ scenario: "j1", step: "J1", questions: [{ module: "M1", text: "Who signs?" }], tags: [{ table: "rights", row: "anchor" }] }],
};

describe("workshop: every module, table, row and sheet it names is its own", () => {
  test("a consistent workshop parses, and a sheet defaults to A3", () => {
    expect(parseWorkshop(base).sheets![0]!.size).toBe("A3");
  });
  test("a question in an undeclared module is refused", () => {
    expect(() => parseWorkshop({ ...base, steps: [{ scenario: "j1", step: "J1", questions: [{ module: "M9", text: "?" }] }] })).toThrow(/module "M9"/);
  });
  test("a tag on an unknown row, and a module filling an unknown sheet, are refused", () => {
    expect(() => parseWorkshop({ ...base, steps: [{ scenario: "j1", step: "J1", tags: [{ table: "rights", row: "nobody" }] }] })).toThrow(/row "nobody"/);
    expect(() => parseWorkshop({ ...base, modules: [{ id: "M1", title: "One", sheet: "s9" }] })).toThrow(/sheet "s9"/);
  });
  test("the same step twice is refused", () => {
    expect(() => parseWorkshop({ ...base, steps: [base.steps[0], base.steps[0]] })).toThrow(/appears twice/);
  });
});
