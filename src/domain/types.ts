export type AssetSubType =
  | "housing"
  | "housing_1h1h"
  | "land_business"
  | "land_nonbusiness"
  | "land_nonbusiness_adj"
  | "building";

export type VerificationStatus =
  | "not_verified"
  | "partially_verified"
  | "verified_by_tax_professional"
  | "not_eligible"
  | "unknown";

export type CalculationStatus =
  | "complete"
  | "estimated"
  | "needs_input"
  | "needs_review"
  | "unsupported"
  | "invalid";

export interface ExpenseInput {
  type:
    | "acquisition_tax"
    | "brokerage_fee"
    | "legal_fee"
    | "capital_expenditure"
    | "transfer_cost"
    | "other";
  amount: number;
  evidenceStatus?: "available" | "missing" | "unknown";
  description?: string;
}

export interface OwnerInput {
  ownerId: string;
  sharePercent: number;
  basicDeductionAlreadyUsed?: number;
}

export interface CapitalGainsCase {
  ruleDate: string;
  asset: {
    subType: AssetSubType;
    domestic: boolean;
    registered: boolean;
  };
  transfer: {
    date: string;
    price: number;
  };
  acquisition: {
    date: string;
    price: number;
    method: "purchase" | "inheritance" | "gift" | "other";
  };
  expenses: ExpenseInput[];
  ownership:
    | {
        type: "solo";
        basicDeductionAlreadyUsed?: number;
      }
    | {
        type: "joint";
        owners: OwnerInput[];
      };
  household: {
    houseCount: number;
    residenceYears: number;
    isAdjustedArea: boolean;
    oneHouseExemptionClaimed: boolean;
    exemptionVerificationStatus: VerificationStatus;
  };
  annualContext: {
    otherTransfersExist: boolean;
  };
}

export interface ValidationIssue {
  code: string;
  severity: "error" | "warning" | "unsupported";
  field?: string;
  message: string;
}

export interface ValidationResult {
  status: CalculationStatus;
  validForCalculation: boolean;
  issues: ValidationIssue[];
  questions: string[];
}

export interface Citation {
  lawName: string;
  provision: string;
}

export interface CalculationStep {
  stepCode: string;
  label: string;
  amount: number | null;
  operator: "info" | "add" | "subtract" | "multiply" | "result";
  formula?: string;
  detail?: string;
  citations: Citation[];
}

export interface RateResult {
  rateType: "zero" | "basic" | "shortterm" | "heavy" | "unregistered";
  rateDescription: string;
  tax: number;
  surchargeRate: number;
}

export interface LongTermDeductionResult {
  applicable: boolean;
  ratePercent: number;
  holdingRatePercent: number;
  residenceRatePercent: number;
  excludedReason?: string;
}

export interface SingleCalculationResult {
  ownerId?: string;
  sharePercent?: number;
  exempt: boolean;
  exemptionReason?: string;
  holdingYears: number;
  transferGain: number;
  longTermDeduction: LongTermDeductionResult;
  longTermDeductionAmount: number;
  capitalGainIncome: number;
  basicDeduction: number;
  taxBase: number;
  rateResult: RateResult;
  incomeTax: number;
  localIncomeTax: number;
  totalTax: number;
  steps: CalculationStep[];
}

export interface CapitalGainsCalculationResult {
  status: CalculationStatus;
  ruleVersion: string;
  ruleEffectiveFrom: string;
  ruleVerificationStatus: string;
  calculationType: "solo" | "joint";
  totalTax: number;
  incomeTax: number;
  localIncomeTax: number;
  result?: SingleCalculationResult;
  owners?: SingleCalculationResult[];
  soloComparisonTax?: number;
  estimatedSavingAgainstSolo?: number;
  warnings: string[];
  assumptions: string[];
}
