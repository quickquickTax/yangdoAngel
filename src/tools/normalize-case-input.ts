import { normalizeAcquisitionMethodInput } from "./normalize-acquisition-method-input.js";
import { normalizeAmountInput } from "./normalize-amount-input.js";
import { normalizeAssetInput } from "./normalize-asset-input.js";
import { normalizeBooleanInput } from "./normalize-boolean-input.js";
import { normalizeCountInput } from "./normalize-count-input.js";
import { normalizeDateInput } from "./normalize-date-input.js";
import { normalizeDurationInput } from "./normalize-duration-input.js";
import { normalizeExemptionVerificationInput } from "./normalize-exemption-verification-input.js";
import { normalizeExpenseInput } from "./normalize-expense-input.js";
import { normalizeOwnershipInput } from "./normalize-ownership-input.js";

export const NORMALIZABLE_CASE_FIELDS = [
  "asset.subType",
  "transfer.date",
  "transfer.price",
  "acquisition.date",
  "acquisition.price",
  "acquisition.method",
  "inheritanceDetails.decedentAcquisitionDate",
  "giftDetails.donorRelationship",
  "giftDetails.donorDeceasedAtTransfer",
  "giftDetails.expropriationExclusionPossible",
  "giftDetails.donorOriginalAcquisition.date",
  "giftDetails.donorOriginalAcquisition.price",
  "giftDetails.giftTaxAssessment.calculatedTax",
  "giftDetails.giftTaxAssessment.totalTaxableGiftValue",
  "giftDetails.giftTaxAssessment.transferredAssetTaxableValue",
  "expenses[]",
  "ownership",
  "household.houseCount",
  "household.residenceYears",
  "household.isAdjustedArea",
  "household.oneHouseExemptionClaimed",
  "household.exemptionVerificationStatus",
  "annualContext.otherTransfersExist"
] as const;

export type NormalizableCaseField = (typeof NORMALIZABLE_CASE_FIELDS)[number];

export interface CaseInputNormalizationResult {
  rawValue: string;
  targetField: NormalizableCaseField;
  normalizedValue: unknown;
  readyForCaseData: boolean;
  normalizer: string;
  caseDataPatch: Record<string, unknown> | null;
  confidence: "high" | "low";
  warnings: string[];
  sourceResult: unknown;
}

function makePatch(field: NormalizableCaseField, value: unknown): Record<string, unknown> {
  if (field === "expenses[]") {
    return { expenses: [value] };
  }

  const segments = field.split(".");
  const root: Record<string, unknown> = {};
  let cursor = root;
  for (const segment of segments.slice(0, -1)) {
    const next: Record<string, unknown> = {};
    cursor[segment] = next;
    cursor = next;
  }
  cursor[segments[segments.length - 1]] = value;
  return root;
}

function buildResult(
  rawValue: string,
  targetField: NormalizableCaseField,
  normalizedValue: unknown,
  readyForCaseData: boolean,
  normalizer: string,
  confidence: "high" | "low",
  warnings: string[],
  sourceResult: unknown
): CaseInputNormalizationResult {
  return {
    rawValue,
    targetField,
    normalizedValue,
    readyForCaseData,
    normalizer,
    caseDataPatch: readyForCaseData ? makePatch(targetField, normalizedValue) : null,
    confidence,
    warnings,
    sourceResult
  };
}

export function normalizeCaseInput(
  targetField: NormalizableCaseField,
  rawValue: string
): CaseInputNormalizationResult {
  switch (targetField) {
    case "asset.subType": {
      const result = normalizeAssetInput(rawValue);
      return buildResult(
        rawValue,
        targetField,
        result.assetSubType,
        result.readyForCaseData,
        "normalize_asset_input",
        result.confidence,
        result.warnings,
        result
      );
    }
    case "transfer.date":
    case "acquisition.date":
    case "inheritanceDetails.decedentAcquisitionDate":
    case "giftDetails.donorOriginalAcquisition.date": {
      const result = normalizeDateInput(rawValue);
      const readyForCaseData = result.readyForCaseData && result.kind === "single";
      const warnings = [...result.warnings];
      if (result.kind === "range") {
        warnings.push(`${targetField}에는 단일 날짜가 필요합니다. 기간 중 적용할 날짜를 확인해 주세요.`);
      }
      return buildResult(
        rawValue,
        targetField,
        result.date,
        readyForCaseData,
        "normalize_date_input",
        readyForCaseData ? result.confidence : "low",
        warnings,
        result
      );
    }
    case "transfer.price":
    case "acquisition.price":
    case "giftDetails.donorOriginalAcquisition.price":
    case "giftDetails.giftTaxAssessment.calculatedTax":
    case "giftDetails.giftTaxAssessment.totalTaxableGiftValue":
    case "giftDetails.giftTaxAssessment.transferredAssetTaxableValue": {
      const result = normalizeAmountInput(rawValue);
      return buildResult(
        rawValue,
        targetField,
        result.amount,
        result.readyForCaseData,
        "normalize_amount_input",
        result.confidence,
        result.warnings,
        result
      );
    }
    case "acquisition.method": {
      const result = normalizeAcquisitionMethodInput(rawValue);
      return buildResult(
        rawValue,
        targetField,
        result.method,
        result.readyForCaseData,
        "normalize_acquisition_method_input",
        result.confidence,
        result.warnings,
        result
      );
    }
    case "giftDetails.donorRelationship": {
      const value = rawValue.trim().replace(/\s+/g, "");
      const relationship = /배우자|남편|아내|부인/.test(value)
        ? "spouse"
        : /직계|부모|아버지|어머니|아들|딸|자녀|조부|조모|손자|손녀/.test(value)
          ? "lineal_ascendant_descendant"
          : /특수관계|친족|형제|자매|사촌/.test(value)
            ? "other_related"
            : /무관계|관계없|타인/.test(value)
              ? "unrelated"
              : null;
      return buildResult(
        rawValue,
        targetField,
        relationship,
        relationship !== null,
        "normalize_case_input",
        relationship ? "high" : "low",
        relationship ? [] : ["증여자 관계를 배우자, 직계존비속, 기타 특수관계인, 무관계 중 하나로 확인해 주세요."],
        { relationship }
      );
    }
    case "expenses[]": {
      const result = normalizeExpenseInput(rawValue);
      return buildResult(
        rawValue,
        targetField,
        result.expense,
        result.readyForCaseData,
        "normalize_expense_input",
        result.confidence,
        result.warnings,
        result
      );
    }
    case "ownership": {
      const result = normalizeOwnershipInput(rawValue);
      return buildResult(
        rawValue,
        targetField,
        result.ownership,
        result.readyForCaseData,
        "normalize_ownership_input",
        result.confidence,
        result.warnings,
        result
      );
    }
    case "household.houseCount": {
      const result = normalizeCountInput(rawValue);
      return buildResult(
        rawValue,
        targetField,
        result.count,
        result.readyForCaseData,
        "normalize_count_input",
        result.confidence,
        result.warnings,
        result
      );
    }
    case "household.residenceYears": {
      const result = normalizeDurationInput(rawValue);
      return buildResult(
        rawValue,
        targetField,
        result.residenceYears,
        result.readyForCaseData,
        "normalize_duration_input",
        result.confidence,
        result.warnings,
        result
      );
    }
    case "household.isAdjustedArea":
    case "household.oneHouseExemptionClaimed":
    case "annualContext.otherTransfersExist":
    case "giftDetails.donorDeceasedAtTransfer":
    case "giftDetails.expropriationExclusionPossible": {
      const result = normalizeBooleanInput(rawValue);
      return buildResult(
        rawValue,
        targetField,
        result.value,
        result.readyForCaseData,
        "normalize_boolean_input",
        result.confidence,
        result.warnings,
        result
      );
    }
    case "household.exemptionVerificationStatus": {
      const result = normalizeExemptionVerificationInput(rawValue);
      return buildResult(
        rawValue,
        targetField,
        result.status,
        result.readyForCaseData,
        "normalize_exemption_verification_input",
        result.confidence,
        result.warnings,
        result
      );
    }
  }
}
