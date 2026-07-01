import { describe, expect, it } from "vitest";
import { calculateCapitalGainsTax } from "../../src/domain/calculator.js";
import { validateCapitalGainsCase } from "../../src/domain/validation.js";
import type { CapitalGainsCase } from "../../src/domain/types.js";

function baseCase(): CapitalGainsCase {
  return {
    ruleDate: "2026-04-21",
    asset: { subType: "housing", domestic: true, registered: true },
    transfer: { date: "2026-06-01", price: 500_000_000 },
    acquisition: { date: "2020-01-01", price: 300_000_000, method: "purchase" },
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

describe("inheritance and gift acquisition calculations", () => {
  it("uses separate inheritance holding periods", () => {
    const input = baseCase();
    input.acquisition = {
      date: "2024-01-01",
      price: 300_000_000,
      method: "inheritance",
      valuation: {
        amount: 300_000_000,
        basis: "standard_price",
        status: "determined",
        referenceDate: "2024-01-01",
        confidence: "high"
      }
    };
    input.inheritanceDetails = { decedentAcquisitionDate: "2010-01-01" };

    const result = calculateCapitalGainsTax(input).result!;
    expect(result.holdingPeriods).toEqual({
      longTermDeductionYears: 2,
      rateYears: 16,
      longTermDeductionStartDate: "2024-01-01",
      rateStartDate: "2010-01-01"
    });
    expect(result.longTermDeduction.applicable).toBe(false);
  });

  it("applies donor acquisition information within the gift carryover period", () => {
    const input = baseCase();
    input.acquisition = {
      date: "2024-01-01",
      price: 300_000_000,
      method: "gift",
      valuation: {
        amount: 300_000_000,
        basis: "standard_price",
        status: "reported",
        referenceDate: "2024-01-01",
        confidence: "medium"
      }
    };
    input.giftDetails = {
      donorRelationship: "lineal_ascendant_descendant",
      donorDeceasedAtTransfer: false,
      donorOriginalAcquisition: { date: "2020-01-01", price: 100_000_000 },
      giftTaxAssessment: {
        calculatedTax: 10_000_000,
        totalTaxableGiftValue: 500_000_000,
        transferredAssetTaxableValue: 300_000_000
      }
    };

    const result = calculateCapitalGainsTax(input).result!;
    expect(result.transferGain).toBe(394_000_000);
    expect(result.holdingPeriods.longTermDeductionStartDate).toBe("2020-01-01");
    expect(result.holdingPeriods.rateStartDate).toBe("2020-01-01");
  });

  it("requires a confirmed value for pre-2023 API estimates", () => {
    const input = baseCase();
    input.acquisition = {
      date: "2022-01-01",
      price: 300_000_000,
      method: "inheritance",
      valuation: {
        amount: 300_000_000,
        basis: "standard_price",
        status: "api_estimated",
        referenceDate: "2022-01-01",
        confidence: "low"
      }
    };
    input.inheritanceDetails = { decedentAcquisitionDate: "2010-01-01" };
    expect(validateCapitalGainsCase(input).issues).toContainEqual(
      expect.objectContaining({ code: "HISTORICAL_API_VALUATION_UNSUPPORTED" })
    );
  });

  it("rejects a single appraisal above the standard-price threshold", () => {
    const input = baseCase();
    input.acquisition = {
      date: "2024-01-01",
      price: 1_200_000_000,
      method: "inheritance",
      valuation: {
        amount: 1_200_000_000,
        basis: "appraisal",
        status: "reported",
        referenceDate: "2024-01-01",
        confidence: "medium",
        appraisalDetails: {
          appraiserCount: 1,
          propertyStandardPrice: 1_100_000_000,
          priceBasisDate: "2024-01-01",
          reportDate: "2024-02-01"
        }
      }
    };
    input.inheritanceDetails = { decedentAcquisitionDate: "2010-01-01" };
    expect(validateCapitalGainsCase(input).issues).toContainEqual(
      expect.objectContaining({ code: "SINGLE_APPRAISER_NOT_ALLOWED" })
    );
  });
});
