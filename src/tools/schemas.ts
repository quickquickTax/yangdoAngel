import * as z from "zod/v4";
import type { CapitalGainsCase } from "../domain/types.js";

export const ExpenseSchema = z.object({
  type: z.enum([
    "acquisition_tax",
    "brokerage_fee",
    "legal_fee",
    "capital_expenditure",
    "transfer_cost",
    "other"
  ]),
  amount: z.number().int().nonnegative(),
  evidenceStatus: z.enum(["available", "missing", "unknown"]).optional(),
  description: z.string().max(500).optional()
});

export const OwnerSchema = z.object({
  ownerId: z.string().min(1).max(100),
  sharePercent: z.number().positive().max(100),
  basicDeductionAlreadyUsed: z.number().int().nonnegative().optional()
});

export const CapitalGainsCaseSchema = z.object({
  ruleDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  asset: z.object({
    subType: z.enum([
      "housing",
      "housing_1h1h",
      "land_business",
      "land_nonbusiness",
      "land_nonbusiness_adj",
      "building"
    ])
  }),
  transfer: z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    price: z.number().int().positive()
  }),
  acquisition: z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    price: z.number().int().positive(),
    method: z.enum(["purchase", "inheritance", "gift", "other"])
  }),
  expenses: z.array(ExpenseSchema).default([]),
  ownership: z.discriminatedUnion("type", [
    z.object({
      type: z.literal("solo"),
      basicDeductionAlreadyUsed: z.number().int().nonnegative().optional()
    }),
    z.object({
      type: z.literal("joint"),
      owners: z.array(OwnerSchema).min(2).max(10)
    })
  ]),
  household: z.object({
    houseCount: z.number().int().positive(),
    residenceYears: z.number().int().nonnegative(),
    isAdjustedArea: z.boolean(),
    oneHouseExemptionClaimed: z.boolean(),
    exemptionVerificationStatus: z.enum([
      "not_verified",
      "partially_verified",
      "verified_by_tax_professional",
      "not_eligible",
      "unknown"
    ])
  }),
  annualContext: z.object({
    otherTransfersExist: z.boolean()
  })
});

export type CapitalGainsCaseInput = z.infer<typeof CapitalGainsCaseSchema>;

export function applyServiceScope(
  caseData: CapitalGainsCaseInput
): CapitalGainsCase {
  return {
    ...caseData,
    asset: {
      ...caseData.asset,
      domestic: true,
      registered: true
    }
  };
}

export function applyServiceScopeToPartial(
  caseData: Record<string, unknown>
): Partial<CapitalGainsCase> {
  const asset = caseData.asset;
  if (!asset || typeof asset !== "object" || Array.isArray(asset)) {
    return caseData as Partial<CapitalGainsCase>;
  }

  return {
    ...caseData,
    asset: {
      ...(asset as Record<string, unknown>),
      domestic: true,
      registered: true
    }
  } as Partial<CapitalGainsCase>;
}

export const ValidationToolInputSchema = {
  caseData: z
    .record(z.string(), z.unknown())
    .describe("검증할 양도소득세 사건 데이터. 일부 필드만 전달해도 됩니다.")
};

export const CalculationToolInputSchema = {
  caseData: CapitalGainsCaseSchema.describe(
    "검증과 계산에 필요한 완전한 양도소득세 사건 데이터"
  )
};
