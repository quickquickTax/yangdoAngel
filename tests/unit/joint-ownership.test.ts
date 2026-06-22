import { describe, expect, it } from "vitest";
import { calculateCapitalGainsTax } from "../../src/domain/calculator.js";
import type { CapitalGainsCase } from "../../src/domain/types.js";

const jointHighValueCase: CapitalGainsCase = {
  ruleDate: "2026-04-21",
  asset: { subType: "housing_1h1h", domestic: true, registered: true },
  transfer: { date: "2026-06-01", price: 1_500_000_000 },
  acquisition: { date: "2015-01-01", price: 700_000_000, method: "purchase" },
  expenses: [
    {
      type: "capital_expenditure",
      amount: 30_000_000,
      evidenceStatus: "available"
    }
  ],
  ownership: {
    type: "joint",
    owners: [
      { ownerId: "owner-1", sharePercent: 50 },
      { ownerId: "owner-2", sharePercent: 50 }
    ]
  },
  household: {
    houseCount: 1,
    residenceYears: 7,
    isAdjustedArea: false,
    oneHouseExemptionClaimed: true,
    exemptionVerificationStatus: "verified_by_tax_professional"
  },
  annualContext: { otherTransfersExist: false }
};

describe("joint ownership", () => {
  it("uses the whole-property high-value threshold rather than each owner's allocated price", () => {
    const result = calculateCapitalGainsTax(jointHighValueCase);
    expect(result.calculationType).toBe("joint");
    expect(result.owners).toHaveLength(2);
    expect(result.owners?.every((owner) => !owner.exempt)).toBe(true);
    expect(result.totalTax).toBeGreaterThan(0);
  });
});
