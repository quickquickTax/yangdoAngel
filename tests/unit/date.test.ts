import { describe, expect, it } from "vitest";
import { calculateFullHoldingYears, parseIsoDate } from "../../src/domain/date.js";

describe("date utilities", () => {
  it("calculates full holding years around the anniversary", () => {
    expect(calculateFullHoldingYears("2020-06-01", "2026-05-31")).toBe(5);
    expect(calculateFullHoldingYears("2020-06-01", "2026-06-01")).toBe(6);
  });

  it("rejects impossible dates", () => {
    expect(() => parseIsoDate("2026-02-30")).toThrow("존재하지 않는 날짜");
  });

  it("rejects a transfer date not after acquisition", () => {
    expect(() => calculateFullHoldingYears("2026-06-01", "2026-06-01")).toThrow(
      "양도일은 취득일 이후"
    );
  });
});
