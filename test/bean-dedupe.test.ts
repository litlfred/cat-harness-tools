/**
 * The dedupe plan merges copies of one bean without losing text, and says when
 * it cannot. Each case is a shape measured on the live stores 2026-10-20.
 */
import { describe, expect, test } from "bun:test";
import { headerOk, homeOf, merge3, resolveDiff3 } from "../scripts/bean-dedupe.ts";

const bean = (status: string, updated: string, body: string) =>
  `---\n# folio-assistant-abcd\ntitle: A bean\nstatus: ${status}\ntype: task\nupdated_at: ${updated}\n---\n\n${body}\n`;

describe("homeOf", () => {
  test("a prefix names its home", () => {
    expect(homeOf("cat-tools-0nxe", ["cat-harness-tools"]).home).toBe("cat-harness-tools");
    expect(homeOf("folio-core-1abc", ["folio-assistant-core"]).home).toBe("folio-assistant-core");
  });
  test("a bean one layer took belongs to that layer", () => {
    expect(homeOf("folio-assistant-abcd", ["folio-assistant", "cat-harness", "cat-harness-tools"]).home).toBe("cat-harness-tools");
  });
  test("taken by two layers: no home, the owner chooses", () => {
    expect(homeOf("folio-assistant-abcd", ["cat-harness-tools", "folio-assistant-core"]).home).toBeUndefined();
  });
  test("everything else goes to the main store", () => {
    expect(homeOf("folio-assistant-abcd", ["folio-assistant", "cat-harness"]).home).toBe("folio-assistant");
  });
});

describe("merge3", () => {
  const base = bean("todo", "2026-10-08T00:00:00Z", "Do the thing.");

  test("two dated notes appended at the same place: both kept", () => {
    const a = bean("todo", "2026-10-09T00:00:00Z", "Do the thing.\n\nNote from A.");
    const b = bean("todo", "2026-10-10T00:00:00Z", "Do the thing.\n\nNote from B.");
    const m = merge3([{ store: "a", file: "x", text: a }, { store: "b", file: "x", text: b }], base);
    expect(m.conflicts).toHaveLength(0);
    expect(m.text).toContain("Note from A.");
    expect(m.text).toContain("Note from B.");
    expect(m.text).toContain("updated_at: 2026-10-10T00:00:00Z");
    expect(m.text).not.toContain("updated_at: 2026-10-09T00:00:00Z");
    expect(headerOk(m.text)).toBe(true);
  });

  test("one side closes the bean, the other only touches the body: both changes land", () => {
    const a = bean("completed", "2026-10-09T00:00:00Z", "Do the thing.");
    const b = bean("todo", "2026-10-08T00:00:00Z", "Do the thing, carefully.");
    const m = merge3([{ store: "a", file: "x", text: a }, { store: "b", file: "x", text: b }], base);
    expect(m.conflicts).toHaveLength(0);
    expect(m.text).toContain("status: completed");
    expect(m.text).toContain("carefully");
  });

  test("the same sentence reworded two ways: a conflict, ours kept, theirs reported", () => {
    const a = bean("todo", "2026-10-08T00:00:00Z", "Do the thing, by the owner.");
    const b = bean("todo", "2026-10-08T00:00:00Z", "Do the thing, by a person.");
    const m = merge3([{ store: "a", file: "x", text: a }, { store: "b", file: "x", text: b }], base);
    expect(m.conflicts).toHaveLength(1);
    expect(m.conflicts[0].kept).toContain("by the owner");
    expect(m.conflicts[0].other).toContain("by a person");
    expect(m.text).not.toContain("<<<<<<<");
  });
});

describe("resolveDiff3", () => {
  test("text without conflict markers passes through", () => {
    expect(resolveDiff3("a\nb").text).toBe("a\nb");
  });
});

describe("headerOk", () => {
  test("a duplicated key is invalid", () => {
    expect(headerOk("---\ntitle: t\nstatus: todo\nstatus: completed\n---\n")).toBe(false);
  });
});
