import { describe, expect, it } from "vitest";
import { validateCapitalGainsCase } from "../../src/domain/validation.js";
import type { CapitalGainsCase } from "../../src/domain/types.js";
import { runValidation } from "../../src/tools/validate-capital-gains-case.js";

function validCase(): CapitalGainsCase {
  return {
    ruleDate: "2026-04-21",
    asset: { subType: "housing", domestic: true, registered: true },
    transfer: { date: "2026-06-01", price: 600_000_000 },
    acquisition: {
      date: "2018-01-01",
      price: 300_000_000,
      method: "purchase"
    },
    expenses: [],
    ownership: { type: "solo" },
    household: {
      houseCount: 1,
      residenceYears: 0,
      isAdjustedArea: false,
      oneHouseExemptionClaimed: false,
      exemptionVerificationStatus: "not_eligible"
    },
    annualContext: { otherTransfersExist: false }
  };
}

describe("case validation", () => {
  it("accepts a supported complete case", () => {
    const result = validateCapitalGainsCase(validCase());
    expect(result.validForCalculation).toBe(true);
    expect(result.status).toBe("complete");
  });

  it("rejects joint shares not summing to 100", () => {
    const input = validCase();
    input.ownership = {
      type: "joint",
      owners: [
        { ownerId: "a", sharePercent: 50 },
        { ownerId: "b", sharePercent: 40 }
      ]
    };
    const result = validateCapitalGainsCase(input);
    expect(result.validForCalculation).toBe(false);
    expect(result.issues.some((issue) => issue.code === "JOINT_SHARE_SUM_INVALID")).toBe(true);
  });

  it("marks multiple transfers as unsupported", () => {
    const input = validCase();
    input.annualContext.otherTransfersExist = true;
    const result = validateCapitalGainsCase(input);
    expect(result.status).toBe("unsupported");
    expect(result.validForCalculation).toBe(false);
  });

  it("rejects an unverified exemption claim", () => {
    const input = validCase();
    input.household.oneHouseExemptionClaimed = true;
    input.household.exemptionVerificationStatus = "not_verified";
    const result = validateCapitalGainsCase(input);
    expect(result.status).toBe("invalid");
    expect(result.validForCalculation).toBe(false);
  });

  it("rejects an exemption claim inconsistent with the asset and house count", () => {
    const input = validCase();
    input.asset.subType = "building";
    input.household.houseCount = 3;
    input.household.oneHouseExemptionClaimed = true;
    input.household.exemptionVerificationStatus = "verified_by_tax_professional";
    const result = validateCapitalGainsCase(input);
    expect(result.validForCalculation).toBe(false);
    expect(
      result.issues.some(
        (issue) => issue.code === "ONE_HOUSE_EXEMPTION_INCONSISTENT"
      )
    ).toBe(true);
  });

  it("rejects a rule that was not effective on the transfer date", () => {
    const input = validCase();
    input.transfer.date = "2025-06-01";
    const result = validateCapitalGainsCase(input);
    expect(result.validForCalculation).toBe(false);
    expect(
      result.issues.some(
        (issue) => issue.code === "RULE_NOT_EFFECTIVE_ON_TRANSFER_DATE"
      )
    ).toBe(true);
  });

  it("rejects expenses without evidence and unsupported other expenses", () => {
    const input = validCase();
    input.expenses = [
      { type: "other", amount: 10_000_000, evidenceStatus: "missing" }
    ];
    const result = validateCapitalGainsCase(input);
    expect(result.status).toBe("unsupported");
    expect(result.validForCalculation).toBe(false);
    expect(
      result.issues.some((issue) => issue.code === "OTHER_EXPENSE_UNSUPPORTED")
    ).toBe(true);
    expect(
      result.issues.some((issue) => issue.code === "EXPENSE_EVIDENCE_REQUIRED")
    ).toBe(true);
  });

  it("rejects residence years exceeding the holding period", () => {
    const input = validCase();
    input.household.residenceYears = 99;
    const result = validateCapitalGainsCase(input);
    expect(result.validForCalculation).toBe(false);
    expect(
      result.issues.some(
        (issue) => issue.code === "RESIDENCE_EXCEEDS_HOLDING_PERIOD"
      )
    ).toBe(true);
  });

  it("returns an invalid result for a partial joint ownership object", () => {
    const result = validateCapitalGainsCase({
      ownership: { type: "joint" } as CapitalGainsCase["ownership"]
    });
    expect(result.status).toBe("invalid");
    expect(
      result.issues.some((issue) => issue.code === "JOINT_OWNERS_REQUIRED")
    ).toBe(true);
  });

  it("returns schema errors for malformed nested MCP input", () => {
    const result = runValidation({
      expenses: [null],
      ownership: { type: "joint" }
    });
    expect(result.status).toBe("invalid");
    expect(result.validForCalculation).toBe(false);
    expect(result.issues.some((issue) => issue.code === "SCHEMA_INVALID")).toBe(
      true
    );
  });
});
