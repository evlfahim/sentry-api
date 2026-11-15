import { describe, it, expect } from "vitest";
import { diff, formatDiff, formatDiffs } from "../src/diff";

describe("diff", () => {
  it("should return empty array for identical values", () => {
    const result = diff({ a: 1 }, { a: 1 });
    expect(result).toEqual([]);
  });

  it("should detect a changed primitive value", () => {
    const result = diff(1, 2);
    expect(result).toEqual([{ path: "", old: 1, new: 2, type: "changed" }]);
  });

  it("should detect a changed object property", () => {
    const result = diff({ a: 1, b: 2 }, { a: 1, b: 3 });
    expect(result).toEqual([{ path: "b", old: 2, new: 3, type: "changed" }]);
  });

  it("should detect added properties", () => {
    const result = diff({ a: 1 }, { a: 1, b: 2 });
    expect(result).toEqual([
      { path: "b", old: undefined, new: 2, type: "changed" },
    ]);
  });

  it("should detect removed properties", () => {
    const result = diff({ a: 1, b: 2 }, { a: 1 });
    expect(result).toEqual([
      { path: "b", old: 2, new: undefined, type: "changed" },
    ]);
  });

  it("should detect changes in nested objects", () => {
    const result = diff(
      { user: { name: "John", age: 30 } },
      { user: { name: "Jane", age: 30 } },
    );
    expect(result).toEqual([
      { path: "user.name", old: "John", new: "Jane", type: "changed" },
    ]);
  });

  it("should detect changes in arrays", () => {
    const result = diff([1, 2, 3], [1, 4, 3]);
    expect(result).toEqual([{ path: "[1]", old: 2, new: 4, type: "changed" }]);
  });

  it("should detect added array elements", () => {
    const result = diff([1, 2], [1, 2, 3]);
    expect(result).toEqual([
      { path: "[2]", old: undefined, new: 3, type: "changed" },
    ]);
  });

  it("should detect removed array elements", () => {
    const result = diff([1, 2, 3], [1, 2]);
    expect(result).toEqual([
      { path: "[2]", old: 3, new: undefined, type: "changed" },
    ]);
  });

  it("should detect multiple changes in an object", () => {
    const result = diff({ a: 1, b: 2, c: 3 }, { a: 10, b: 2, c: 30 });
    expect(result).toEqual([
      { path: "a", old: 1, new: 10, type: "changed" },
      { path: "c", old: 3, new: 30, type: "changed" },
    ]);
  });

  it("should handle null values", () => {
    const result = diff(null, { a: 1 });
    expect(result.length).toBeGreaterThan(0);
  });

  it("should handle undefined values", () => {
    const result = diff(undefined, { a: 1 });
    expect(result.length).toBeGreaterThan(0);
  });

  it("should handle string values", () => {
    const result = diff("hello", "world");
    expect(result).toEqual([
      { path: "", old: "hello", new: "world", type: "changed" },
    ]);
  });

  it("should handle boolean values", () => {
    const result = diff(true, false);
    expect(result).toEqual([
      { path: "", old: true, new: false, type: "changed" },
    ]);
  });

  it("should handle deeply nested objects", () => {
    const result = diff({ a: { b: { c: 1 } } }, { a: { b: { c: 2 } } });
    expect(result).toEqual([
      { path: "a.b.c", old: 1, new: 2, type: "changed" },
    ]);
  });

  it("should handle arrays of objects", () => {
    const result = diff(
      [
        { id: 1, name: "A" },
        { id: 2, name: "B" },
      ],
      [
        { id: 1, name: "A" },
        { id: 2, name: "C" },
      ],
    );
    expect(result).toEqual([
      { path: "[1].name", old: "B", new: "C", type: "changed" },
    ]);
  });

  it("should handle identical arrays", () => {
    const result = diff([1, 2, 3], [1, 2, 3]);
    expect(result).toEqual([]);
  });

  it("should handle identical objects", () => {
    const result = diff({ a: 1, b: { c: 2 } }, { a: 1, b: { c: 2 } });
    expect(result).toEqual([]);
  });

  it("should handle empty objects", () => {
    const result = diff({}, {});
    expect(result).toEqual([]);
  });

  it("should handle empty arrays", () => {
    const result = diff([], []);
    expect(result).toEqual([]);
  });

  it("should handle response-like objects", () => {
    const oldResponse = {
      status: 200,
      headers: { "content-type": "application/json" },
      data: { users: [{ id: 1, name: "John" }] },
      duration: 100,
    };
    const newResponse = {
      status: 200,
      headers: { "content-type": "application/json" },
      data: { users: [{ id: 1, name: "Jane" }] },
      duration: 150,
    };

    const result = diff(oldResponse, newResponse);
    expect(result.length).toBeGreaterThan(0);
    expect(result.some((d) => d.path === "data.users[0].name")).toBe(true);
    expect(result.some((d) => d.path === "duration")).toBe(true);
  });
});

describe("formatDiff", () => {
  it("should format a changed diff", () => {
    const d = { path: "a.b", old: 1, new: 2, type: "changed" as const };
    const result = formatDiff(d);
    expect(result).toBe("~ a.b: 1 → 2");
  });

  it("should format an added diff", () => {
    const d = { path: "c", old: undefined, new: 3, type: "added" as const };
    const result = formatDiff(d);
    expect(result).toBe("+ c: 3");
  });

  it("should format a removed diff", () => {
    const d = { path: "d", old: 4, new: undefined, type: "removed" as const };
    const result = formatDiff(d);
    expect(result).toBe("- d: 4");
  });
});

describe("formatDiffs", () => {
  it("should format multiple diffs", () => {
    const diffs = [
      { path: "a", old: 1, new: 2, type: "changed" as const },
      { path: "b", old: 3, new: 4, type: "changed" as const },
    ];
    const result = formatDiffs(diffs);
    expect(result).toBe("~ a: 1 → 2\n~ b: 3 → 4");
  });
});
