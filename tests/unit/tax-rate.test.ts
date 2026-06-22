import { describe, expect, it } from "vitest";
import { calculateBasicTax } from "../../src/domain/tax-rate.js";
import { getRules } from "../../src/rules/rule-registry.js";

const rules = getRules("2026-04-21");

describe("basic progressive tax", () => {
  it.each([
    [13_999_999, Math.floor(13_999_999 * 0.06)],
    [14_000_000, 840_000],
    [14_000_001, Math.floor(14_000_001 * 0.15 - 1_260_000)],
    [50_000_000, 6_240_000],
    [50_000_001, Math.floor(50_000_001 * 0.24 - 5_760_000)]
  ])("calculates boundary %i", (taxBase, expected) => {
    expect(calculateBasicTax(taxBase, rules)).toBe(expected);
  });
});
