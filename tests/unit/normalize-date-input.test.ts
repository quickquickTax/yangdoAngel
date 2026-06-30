import { describe, expect, it } from "vitest";
import { normalizeDateInput } from "../../src/tools/normalize-date-input.js";

describe("normalizeDateInput", () => {
  it.each([
    ["2026-01-01", "2026-01-01"],
    ["2026.1.1", "2026-01-01"],
    ["2026년 1월 1일", "2026-01-01"],
    ["20260101", "2026-01-01"],
    ["260101", "2026-01-01"]
  ])("normalizes single date %s", (rawDate, expected) => {
    const result = normalizeDateInput(rawDate);

    expect(result.kind).toBe("single");
    expect(result.date).toBe(expected);
    expect(result.startDate).toBe(expected);
    expect(result.endDate).toBeNull();
    expect(result.confidence).toBe("high");
  });

  it.each([
    ["2025.01.01.-2026.01.01", "2025-01-01", "2026-01-01"],
    ["250101-260101", "2025-01-01", "2026-01-01"],
    ["20250101~20260101", "2025-01-01", "2026-01-01"],
    ["2025년 1월 1일 ~ 2026년 1월 1일", "2025-01-01", "2026-01-01"]
  ])("normalizes date range %s", (rawDate, startDate, endDate) => {
    const result = normalizeDateInput(rawDate);

    expect(result.kind).toBe("range");
    expect(result.startDate).toBe(startDate);
    expect(result.endDate).toBe(endDate);
    expect(result.dates).toEqual([startDate, endDate]);
    expect(result.confidence).toBe("high");
  });

  it("maps two digit years from 70 to 99 to the 1900s", () => {
    const result = normalizeDateInput("991231");

    expect(result.date).toBe("1999-12-31");
  });

  it("warns when the range is reversed", () => {
    const result = normalizeDateInput("260101-250101");

    expect(result.kind).toBe("range");
    expect(result.confidence).toBe("low");
    expect(result.warnings).toContain(
      "시작일이 종료일보다 늦습니다. 날짜 순서를 확인해 주세요."
    );
  });

  it("returns invalid for unparseable input", () => {
    const result = normalizeDateInput("내년 초");

    expect(result.kind).toBe("invalid");
    expect(result.date).toBeNull();
    expect(result.confidence).toBe("low");
  });
});
