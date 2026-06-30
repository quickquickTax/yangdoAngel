import { describe, expect, it } from "vitest";
import { normalizeAmountInput } from "../../src/tools/normalize-amount-input.js";

describe("normalizeAmountInput", () => {
  it.each([
    ["750,000,000", 750_000_000],
    ["750,000,000원", 750_000_000],
    ["7.5억", 750_000_000],
    ["7억5000만", 750_000_000],
    ["7억 5천만", 750_000_000],
    ["양도가액은 7억 5천만 정도입니다", 750_000_000],
    ["취득가액은 3억이에요", 300_000_000],
    ["대략 750,000,000원입니다", 750_000_000],
    ["3억2000만원", 320_000_000],
    ["8500만원", 85_000_000],
    ["2천만원", 20_000_000]
  ])("normalizes %s to won integer", (rawAmount, expected) => {
    const result = normalizeAmountInput(rawAmount);

    expect(result.amount).toBe(expected);
    expect(result.targetField).toBe("amount");
    expect(result.normalizedValue).toBe(expected);
    expect(result.readyForCaseData).toBe(true);
    expect(result.confidence).toBe("high");
    expect(result.warnings).toEqual([]);
  });

  it("keeps seven eok as seven hundred million won", () => {
    const result = normalizeAmountInput("7억");

    expect(result.amount).toBe(700_000_000);
    expect(result.displayAmount).toBe("700,000,000원");
  });

  it("returns a warning when amount cannot be parsed", () => {
    const result = normalizeAmountInput("많이");

    expect(result.amount).toBeNull();
    expect(result.normalizedValue).toBeNull();
    expect(result.readyForCaseData).toBe(false);
    expect(result.confidence).toBe("low");
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});
