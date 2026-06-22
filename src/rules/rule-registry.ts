import rule20260421 from "./data/2026-04-21.json" with { type: "json" };

export interface TaxBracketRule {
  upperLimit: number | null;
  rate: number;
  quickDeduction: number;
}

export interface CapitalGainsRules {
  ruleVersion: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  verificationStatus: string;
  sourceNote: string;
  highValueHousingThreshold: number;
  basicDeduction: number;
  localIncomeTaxRate: number;
  incomeTaxBrackets: TaxBracketRule[];
  shortTermRates: {
    housingUnderOneYear: number;
    housingOneToTwoYears: number;
    otherUnderOneYear: number;
    otherOneToTwoYears: number;
    unregistered: number;
  };
  surcharges: {
    adjustedAreaTwoHouses: number;
    adjustedAreaThreeOrMoreHouses: number;
    nonBusinessLand: number;
  };
  longTermDeduction: {
    general: {
      minimumHoldingYears: number;
      initialRatePercent: number;
      annualIncrementPercent: number;
      maximumRatePercent: number;
    };
    oneHouse: {
      minimumHoldingYears: number;
      holdingInitialRatePercent: number;
      holdingAnnualIncrementPercent: number;
      holdingMaximumRatePercent: number;
      minimumResidenceYears: number;
      residenceInitialRatePercent: number;
      residenceAnnualIncrementPercent: number;
      residenceMaximumRatePercent: number;
    };
  };
  citations: Record<string, string[]>;
}

const RULES = new Map<string, CapitalGainsRules>([
  ["2026-04-21", rule20260421 as CapitalGainsRules]
]);

export function getRules(ruleDate: string): CapitalGainsRules {
  const rules = RULES.get(ruleDate);
  if (!rules) {
    throw new Error(
      `지원하지 않는 규칙 기준일입니다: ${ruleDate}. 현재 지원: ${[...RULES.keys()].join(", ")}`
    );
  }
  return rules;
}

export function isRuleApplicableOn(
  rules: CapitalGainsRules,
  transferDate: string
): boolean {
  return (
    transferDate >= rules.effectiveFrom &&
    (rules.effectiveTo === null || transferDate <= rules.effectiveTo)
  );
}

export function listSupportedRuleDates(): string[] {
  return [...RULES.keys()];
}
