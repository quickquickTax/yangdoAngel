import type { LongTermDeductionResult } from "./types.js";
import type { CapitalGainsRules } from "../rules/rule-registry.js";

export function calculateLongTermDeduction(
  holdingYears: number,
  residenceYears: number,
  oneHouseCalculation: boolean,
  rules: CapitalGainsRules
): LongTermDeductionResult {
  if (holdingYears < rules.longTermDeduction.general.minimumHoldingYears) {
    return {
      applicable: false,
      ratePercent: 0,
      holdingRatePercent: 0,
      residenceRatePercent: 0
    };
  }

  if (oneHouseCalculation) {
    const oneHouse = rules.longTermDeduction.oneHouse;
    const holdingRatePercent = Math.min(
      oneHouse.holdingMaximumRatePercent,
      oneHouse.holdingInitialRatePercent +
        (Math.max(holdingYears, oneHouse.minimumHoldingYears) -
          oneHouse.minimumHoldingYears) *
          oneHouse.holdingAnnualIncrementPercent
    );

    const residenceRatePercent =
      residenceYears >= oneHouse.minimumResidenceYears
        ? Math.min(
            oneHouse.residenceMaximumRatePercent,
            oneHouse.residenceInitialRatePercent +
              (Math.max(residenceYears, oneHouse.minimumResidenceYears) -
                oneHouse.minimumResidenceYears) *
                oneHouse.residenceAnnualIncrementPercent
          )
        : 0;

    return {
      applicable: true,
      holdingRatePercent,
      residenceRatePercent,
      ratePercent: holdingRatePercent + residenceRatePercent
    };
  }

  const general = rules.longTermDeduction.general;
  const holdingRatePercent = Math.min(
    general.maximumRatePercent,
    general.initialRatePercent +
      (Math.max(holdingYears, general.minimumHoldingYears) -
        general.minimumHoldingYears) *
        general.annualIncrementPercent
  );

  return {
    applicable: true,
    holdingRatePercent,
    residenceRatePercent: 0,
    ratePercent: holdingRatePercent
  };
}
