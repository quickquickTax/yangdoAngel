import { describe, expect, it } from "vitest";
import { isWithinGiftCarryoverPeriod } from "../../src/domain/acquisition.js";

describe("gift carryover period", () => {
  it("includes the exact ten-year boundary for gifts from 2023", () => {
    expect(isWithinGiftCarryoverPeriod("2023-01-01", "2033-01-01")).toBe(true);
    expect(isWithinGiftCarryoverPeriod("2023-01-01", "2033-01-02")).toBe(false);
  });

  it("uses the five-year boundary for earlier gifts", () => {
    expect(isWithinGiftCarryoverPeriod("2022-01-01", "2027-01-01")).toBe(true);
    expect(isWithinGiftCarryoverPeriod("2022-01-01", "2027-01-02")).toBe(false);
  });
});
