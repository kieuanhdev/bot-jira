import { describe, it, expect } from "vitest";
import { toCsv, CSV_FORMULA_RE } from "./write";

describe("toCsv (Task 1.1)", () => {
  it("prepends a single quote to formulas starting with =", () => {
    expect(toCsv([["=SUM(A1)"]])).toBe("'=SUM(A1)");
  });

  it("prepends a single quote to cells starting with + or @", () => {
    const csv = toCsv([["+1 call"], ["@user"]]);
    expect(csv).toContain("'+1 call");
    expect(csv).toContain("'@user");
  });

  it("does not escape negative numbers", () => {
    expect(toCsv([[-3, "-3", "-2.5"]])).toBe("-3,-3,-2.5");
  });

  it("escapes hyphen followed by non-numeric text", () => {
    expect(toCsv([["-abc"]])).toBe("'-abc");
  });

  it("escapes fields containing double quotes, commas, and newlines per RFC 4180", () => {
    expect(toCsv([['a"b', "x,y", "l1\nl2"]])).toBe('"a""b","x,y","l1\nl2"');
  });

  it("formats null and undefined as empty cells", () => {
    expect(toCsv([[null, undefined]])).toBe(",");
  });

  it("includes UTF-8 BOM when bom: true is specified", () => {
    expect(toCsv([["a"]], { bom: true }).startsWith("\uFEFF")).toBe(true);
  });

  it("quotes all cells when quoteStrings: true is specified, including empty cells", () => {
    expect(toCsv([["a", null, 123]], { quoteStrings: true })).toBe('"a","","123"');
  });

  it("neutralises formula injection even when quoteStrings: true", () => {
    expect(toCsv([["=cmd"]], { quoteStrings: true })).toBe('"\'=cmd"');
  });
});

describe("CSV_FORMULA_RE", () => {
  it("matches formula trigger characters at string start", () => {
    expect(CSV_FORMULA_RE.test("=1+1")).toBe(true);
    expect(CSV_FORMULA_RE.test("+SUM")).toBe(true);
    expect(CSV_FORMULA_RE.test("@admin")).toBe(true);
    expect(CSV_FORMULA_RE.test("\tcmd")).toBe(true);
    expect(CSV_FORMULA_RE.test("\rcmd")).toBe(true);
    expect(CSV_FORMULA_RE.test("-cmd")).toBe(true);
  });

  it("does not match negative numbers or normal text", () => {
    expect(CSV_FORMULA_RE.test("-3")).toBe(false);
    expect(CSV_FORMULA_RE.test("-2.5")).toBe(false);
    expect(CSV_FORMULA_RE.test("normal text")).toBe(false);
    expect(CSV_FORMULA_RE.test("123")).toBe(false);
  });
});
