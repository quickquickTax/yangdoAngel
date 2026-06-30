import { calculateFullHoldingYears } from "./date.js";
import { calculateLongTermDeduction } from "./long-term-deduction.js";
import { calculateRateTax } from "./tax-rate.js";
import type {
  CapitalGainsCalculationResult,
  CapitalGainsCase,
  CalculationStep,
  Citation,
  SingleCalculationResult
} from "./types.js";
import type { CapitalGainsRules } from "../rules/rule-registry.js";
import { getRules } from "../rules/rule-registry.js";
import { validateCapitalGainsCase } from "./validation.js";

function citations(rules: CapitalGainsRules, key: string): Citation[] {
  return (rules.citations[key] ?? []).map((source) => {
    const firstSpace = source.indexOf(" ");
    return firstSpace < 0
      ? { lawName: source, provision: "" }
      : { lawName: source.slice(0, firstSpace), provision: source.slice(firstSpace + 1) };
  });
}

function sumExpenses(input: CapitalGainsCase): number {
  return input.expenses
    .filter(
      (expense) =>
        expense.type !== "other" && expense.evidenceStatus === "available"
    )
    .reduce((sum, expense) => sum + expense.amount, 0);
}

function calculateSingle(
  input: CapitalGainsCase,
  rules: CapitalGainsRules,
  allocated: {
    transferPrice: number;
    acquisitionPrice: number;
    necessaryExpense: number;
    basicDeductionAlreadyUsed: number;
    grossTransferPrice: number;
    ownerId?: string;
    sharePercent?: number;
  }
): SingleCalculationResult {
  const holdingYears = calculateFullHoldingYears(
    input.acquisition.date,
    input.transfer.date
  );
  const steps: CalculationStep[] = [
    {
      stepCode: "HOLDING_PERIOD",
      label: "보유기간",
      amount: null,
      operator: "info",
      detail: `${input.acquisition.date} ~ ${input.transfer.date}: 만 ${holdingYears}년`,
      citations: citations(rules, "holdingPeriod")
    }
  ];

  const exemptionClaimed =
    input.household.oneHouseExemptionClaimed &&
    input.household.houseCount === 1 &&
    (input.asset.subType === "housing" ||
      input.asset.subType === "housing_1h1h") &&
    input.household.exemptionVerificationStatus ===
      "verified_by_tax_professional";
  let exemptionReason: string | undefined;

  if (exemptionClaimed && allocated.grossTransferPrice <= rules.highValueHousingThreshold) {
    exemptionReason = "1세대 1주택 비과세 요건 충족을 전제로 한 계산";
    steps.push({
      stepCode: "ONE_HOUSE_EXEMPTION",
      label: "1세대 1주택 비과세",
      amount: 0,
      operator: "result",
      detail: exemptionReason,
      citations: citations(rules, "oneHouseExemption")
    });
    return {
      ...(allocated.ownerId ? { ownerId: allocated.ownerId } : {}),
      ...(allocated.sharePercent !== undefined
        ? { sharePercent: allocated.sharePercent }
        : {}),
      exempt: true,
      exemptionReason,
      holdingYears,
      transferGain: 0,
      longTermDeduction: {
        applicable: false,
        ratePercent: 0,
        holdingRatePercent: 0,
        residenceRatePercent: 0
      },
      longTermDeductionAmount: 0,
      capitalGainIncome: 0,
      basicDeduction: 0,
      taxBase: 0,
      rateResult: {
        rateType: "zero",
        rateDescription: "비과세",
        tax: 0,
        surchargeRate: 0
      },
      incomeTax: 0,
      localIncomeTax: 0,
      totalTax: 0,
      steps
    };
  }

  const totalCost = allocated.acquisitionPrice + allocated.necessaryExpense;
  let transferGain = allocated.transferPrice - totalCost;
  steps.push({
    stepCode: "TRANSFER_GAIN",
    label: "양도차익",
    amount: transferGain,
    operator: "result",
    formula: "양도가액 - 취득가액 - 필요경비",
    citations: citations(rules, "transferGain")
  });

  if (exemptionClaimed && allocated.grossTransferPrice > rules.highValueHousingThreshold) {
    const taxableRatio =
      (allocated.grossTransferPrice - rules.highValueHousingThreshold) /
      allocated.grossTransferPrice;
    transferGain = Math.floor(transferGain * taxableRatio);
    exemptionReason = "1세대 1주택 고가주택 과세대상분 안분을 전제로 한 계산";
    steps.push({
      stepCode: "HIGH_VALUE_HOUSING_ALLOCATION",
      label: "고가주택 과세대상 양도차익",
      amount: transferGain,
      operator: "multiply",
      formula: "양도차익 × (양도가액 - 고가주택 기준금액) ÷ 양도가액",
      detail: `과세비율 ${(taxableRatio * 100).toFixed(4)}%`,
      citations: citations(rules, "highValueHousing")
    });
  }

  if (transferGain <= 0) {
    return {
      ...(allocated.ownerId ? { ownerId: allocated.ownerId } : {}),
      ...(allocated.sharePercent !== undefined
        ? { sharePercent: allocated.sharePercent }
        : {}),
      exempt: false,
      ...(exemptionReason ? { exemptionReason } : {}),
      holdingYears,
      transferGain,
      longTermDeduction: {
        applicable: false,
        ratePercent: 0,
        holdingRatePercent: 0,
        residenceRatePercent: 0
      },
      longTermDeductionAmount: 0,
      capitalGainIncome: 0,
      basicDeduction: 0,
      taxBase: 0,
      rateResult: {
        rateType: "zero",
        rateDescription: "양도차손",
        tax: 0,
        surchargeRate: 0
      },
      incomeTax: 0,
      localIncomeTax: 0,
      totalTax: 0,
      steps
    };
  }

  let longTermDeduction = calculateLongTermDeduction(
    holdingYears,
    input.household.residenceYears,
    exemptionClaimed,
    rules
  );

  if (!input.asset.registered) {
    longTermDeduction = {
      applicable: false,
      ratePercent: 0,
      holdingRatePercent: 0,
      residenceRatePercent: 0,
      excludedReason: "미등기 자산"
    };
  } else if (input.household.isAdjustedArea && input.household.houseCount >= 2) {
    longTermDeduction = {
      applicable: false,
      ratePercent: 0,
      holdingRatePercent: 0,
      residenceRatePercent: 0,
      excludedReason: "조정대상지역 다주택 중과 계산 전제"
    };
  }

  const longTermDeductionAmount = longTermDeduction.applicable
    ? Math.floor((transferGain * longTermDeduction.ratePercent) / 100)
    : 0;
  steps.push({
    stepCode: "LONG_TERM_HOLDING_DEDUCTION",
    label: "장기보유특별공제",
    amount: longTermDeductionAmount,
    operator: "subtract",
    formula: "과세대상 양도차익 × 공제율",
    detail: longTermDeduction.excludedReason ?? `공제율 ${longTermDeduction.ratePercent}%`,
    citations: citations(rules, "longTermDeduction")
  });

  const capitalGainIncome = transferGain - longTermDeductionAmount;
  const availableBasicDeduction = input.asset.registered
    ? Math.max(0, rules.basicDeduction - allocated.basicDeductionAlreadyUsed)
    : 0;
  const basicDeduction = availableBasicDeduction;
  const taxBase = Math.max(0, capitalGainIncome - basicDeduction);

  steps.push({
    stepCode: "CAPITAL_GAIN_INCOME",
    label: "양도소득금액",
    amount: capitalGainIncome,
    operator: "result",
    formula: "양도차익 - 장기보유특별공제",
    citations: citations(rules, "longTermDeduction")
  });
  steps.push({
    stepCode: "BASIC_DEDUCTION",
    label: "양도소득 기본공제",
    amount: basicDeduction,
    operator: "subtract",
    detail: `기본공제 기사용액 ${allocated.basicDeductionAlreadyUsed.toLocaleString("ko-KR")}원`,
    citations: citations(rules, "basicDeduction")
  });
  steps.push({
    stepCode: "TAX_BASE",
    label: "과세표준",
    amount: taxBase,
    operator: "result",
    formula: "양도소득금액 - 기본공제",
    citations: citations(rules, "taxBase")
  });

  const rateResult = calculateRateTax({
    taxBase,
    holdingYears,
    assetSubType: input.asset.subType,
    houseCount: input.household.houseCount,
    isAdjustedArea: input.household.isAdjustedArea,
    isUnregistered: !input.asset.registered,
    rules
  });
  const incomeTax = rateResult.tax;
  const localIncomeTax = Math.floor(incomeTax * rules.localIncomeTaxRate);
  const totalTax = incomeTax + localIncomeTax;

  steps.push({
    stepCode: "INCOME_TAX",
    label: "양도소득 산출세액",
    amount: incomeTax,
    operator: "result",
    detail: rateResult.rateDescription,
    citations: citations(rules, "incomeTax")
  });
  steps.push({
    stepCode: "LOCAL_INCOME_TAX",
    label: "개인지방소득세",
    amount: localIncomeTax,
    operator: "add",
    formula: `양도소득세 × ${rules.localIncomeTaxRate * 100}%`,
    citations: citations(rules, "localIncomeTax")
  });
  steps.push({
    stepCode: "TOTAL_TAX",
    label: "총 예상 세액",
    amount: totalTax,
    operator: "result",
    formula: "양도소득세 + 개인지방소득세",
    citations: []
  });

  return {
    ...(allocated.ownerId ? { ownerId: allocated.ownerId } : {}),
    ...(allocated.sharePercent !== undefined
      ? { sharePercent: allocated.sharePercent }
      : {}),
    exempt: false,
    ...(exemptionReason ? { exemptionReason } : {}),
    holdingYears,
    transferGain,
    longTermDeduction,
    longTermDeductionAmount,
    capitalGainIncome,
    basicDeduction,
    taxBase,
    rateResult,
    incomeTax,
    localIncomeTax,
    totalTax,
    steps
  };
}

export function calculateCapitalGainsTax(
  input: CapitalGainsCase
): CapitalGainsCalculationResult {
  const validation = validateCapitalGainsCase(input);
  if (!validation.validForCalculation) {
    throw new Error(
      validation.issues.map((issue) => `${issue.code}: ${issue.message}`).join(" | ")
    );
  }

  const rules = getRules(input.ruleDate);
  const necessaryExpense = sumExpenses(input);
  const warnings = validation.issues
    .filter((issue) => issue.severity === "warning")
    .map((issue) => issue.message);

  warnings.push(rules.sourceNote);
  const assumptions = [
    "입력값이 실제 거래자료와 증빙자료에 일치한다고 가정합니다.",
    "동일 과세기간의 다른 양도 거래가 없다고 가정합니다."
  ];

  if (input.ownership.type === "solo") {
    const result = calculateSingle(input, rules, {
      transferPrice: input.transfer.price,
      acquisitionPrice: input.acquisition.price,
      necessaryExpense,
      basicDeductionAlreadyUsed: input.ownership.basicDeductionAlreadyUsed ?? 0,
      grossTransferPrice: input.transfer.price
    });
    return {
      status:
        validation.status === "needs_review"
          ? "needs_review"
          : rules.verificationStatus === "verified"
            ? "complete"
            : "estimated",
      ruleVersion: rules.ruleVersion,
      ruleEffectiveFrom: rules.effectiveFrom,
      ruleVerificationStatus: rules.verificationStatus,
      calculationType: "solo",
      totalTax: result.totalTax,
      incomeTax: result.incomeTax,
      localIncomeTax: result.localIncomeTax,
      result,
      warnings,
      assumptions
    };
  }

  const owners = input.ownership.owners.map((owner) => {
    const ratio = owner.sharePercent / 100;
    return calculateSingle(input, rules, {
      transferPrice: Math.floor(input.transfer.price * ratio),
      acquisitionPrice: Math.floor(input.acquisition.price * ratio),
      necessaryExpense: Math.floor(necessaryExpense * ratio),
      basicDeductionAlreadyUsed: owner.basicDeductionAlreadyUsed ?? 0,
      grossTransferPrice: input.transfer.price,
      ownerId: owner.ownerId,
      sharePercent: owner.sharePercent
    });
  });

  const totalTax = owners.reduce((sum, owner) => sum + owner.totalTax, 0);
  const incomeTax = owners.reduce((sum, owner) => sum + owner.incomeTax, 0);
  const localIncomeTax = owners.reduce(
    (sum, owner) => sum + owner.localIncomeTax,
    0
  );

  const soloComparison = calculateSingle(input, rules, {
    transferPrice: input.transfer.price,
    acquisitionPrice: input.acquisition.price,
    necessaryExpense,
    basicDeductionAlreadyUsed: 0,
    grossTransferPrice: input.transfer.price
  });

  return {
    status:
      validation.status === "needs_review"
        ? "needs_review"
        : rules.verificationStatus === "verified"
          ? "complete"
          : "estimated",
    ruleVersion: rules.ruleVersion,
    ruleEffectiveFrom: rules.effectiveFrom,
    ruleVerificationStatus: rules.verificationStatus,
    calculationType: "joint",
    totalTax,
    incomeTax,
    localIncomeTax,
    owners,
    soloComparisonTax: soloComparison.totalTax,
    estimatedSavingAgainstSolo: soloComparison.totalTax - totalTax,
    warnings,
    assumptions
  };
}
