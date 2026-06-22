import type { AssetSubType, RateResult } from "./types.js";
import type { CapitalGainsRules } from "../rules/rule-registry.js";

export function calculateBasicTax(
  taxBase: number,
  rules: CapitalGainsRules
): number {
  if (taxBase <= 0) return 0;
  const bracket = rules.incomeTaxBrackets.find(
    (candidate) => candidate.upperLimit === null || taxBase <= candidate.upperLimit
  );
  if (!bracket) throw new Error("세율구간을 찾을 수 없습니다.");
  return Math.max(0, Math.floor(taxBase * bracket.rate - bracket.quickDeduction));
}

export function calculateRateTax(options: {
  taxBase: number;
  holdingYears: number;
  assetSubType: AssetSubType;
  houseCount: number;
  isAdjustedArea: boolean;
  isUnregistered: boolean;
  rules: CapitalGainsRules;
}): RateResult {
  const {
    taxBase,
    holdingYears,
    assetSubType,
    houseCount,
    isAdjustedArea,
    isUnregistered,
    rules
  } = options;

  if (taxBase <= 0) {
    return {
      rateType: "zero",
      rateDescription: "과세표준 없음",
      tax: 0,
      surchargeRate: 0
    };
  }

  if (isUnregistered) {
    return {
      rateType: "unregistered",
      rateDescription: "미등기양도 고정세율",
      tax: Math.floor(taxBase * rules.shortTermRates.unregistered),
      surchargeRate: 0
    };
  }

  const isHousing = assetSubType === "housing" || assetSubType === "housing_1h1h";
  const isNonBusinessLand =
    assetSubType === "land_nonbusiness" || assetSubType === "land_nonbusiness_adj";

  let shortTermTax = 0;
  let shortTermDescription = "";
  if (holdingYears < 1) {
    const rate = isHousing
      ? rules.shortTermRates.housingUnderOneYear
      : rules.shortTermRates.otherUnderOneYear;
    shortTermTax = Math.floor(taxBase * rate);
    shortTermDescription = `보유 1년 미만 ${(rate * 100).toFixed(0)}%`;
  } else if (holdingYears < 2) {
    const rate = isHousing
      ? rules.shortTermRates.housingOneToTwoYears
      : rules.shortTermRates.otherOneToTwoYears;
    shortTermTax = Math.floor(taxBase * rate);
    shortTermDescription = `보유 1년 이상 2년 미만 ${(rate * 100).toFixed(0)}%`;
  }

  const basicTax = calculateBasicTax(taxBase, rules);
  let surchargeRate = 0;
  let surchargeDescription = "";

  if (isHousing && isAdjustedArea) {
    if (houseCount >= 3) {
      surchargeRate = rules.surcharges.adjustedAreaThreeOrMoreHouses;
      surchargeDescription = `조정대상지역 3주택 이상 +${surchargeRate * 100}%p`;
    } else if (houseCount === 2) {
      surchargeRate = rules.surcharges.adjustedAreaTwoHouses;
      surchargeDescription = `조정대상지역 2주택 +${surchargeRate * 100}%p`;
    }
  }

  if (isNonBusinessLand) {
    surchargeRate = rules.surcharges.nonBusinessLand;
    surchargeDescription = `비사업용 토지 +${surchargeRate * 100}%p`;
  }

  const surchargeTax = basicTax + Math.floor(taxBase * surchargeRate);
  const useShortTerm = shortTermTax > 0 && shortTermTax > surchargeTax;

  return {
    rateType: useShortTerm ? "shortterm" : surchargeRate > 0 ? "heavy" : "basic",
    rateDescription: useShortTerm
      ? shortTermDescription
      : surchargeRate > 0
        ? `기본세율 + ${surchargeDescription}`
        : "기본세율",
    tax: useShortTerm ? shortTermTax : surchargeTax,
    surchargeRate
  };
}
