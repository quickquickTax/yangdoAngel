import { describe, expect, it } from "vitest";
import { normalizeAcquisitionMethodInput } from "../../src/tools/normalize-acquisition-method-input.js";
import { normalizeAssetInput } from "../../src/tools/normalize-asset-input.js";
import { normalizeBooleanInput } from "../../src/tools/normalize-boolean-input.js";
import { normalizeDurationInput } from "../../src/tools/normalize-duration-input.js";
import { normalizeExpenseInput } from "../../src/tools/normalize-expense-input.js";
import { normalizeOwnershipInput } from "../../src/tools/normalize-ownership-input.js";

describe("case input normalizers", () => {
  it.each([
    ["아파트", "housing"],
    ["1세대 1주택 아파트", "housing_1h1h"],
    ["상가", "building"],
    ["사업용 토지", "land_business"],
    ["비사업용 토지", "land_nonbusiness"],
    ["조정대상지역 비사업용 토지", "land_nonbusiness_adj"]
  ])("normalizes asset %s", (rawAsset, expected) => {
    const result = normalizeAssetInput(rawAsset);

    expect(result.assetSubType).toBe(expected);
  });

  it("returns land candidates when land business status is unknown", () => {
    const result = normalizeAssetInput("대지");

    expect(result.assetSubType).toBeNull();
    expect(result.candidates).toEqual([
      "land_business",
      "land_nonbusiness",
      "land_nonbusiness_adj"
    ]);
    expect(result.confidence).toBe("low");
  });

  it.each([
    ["샀어요", "purchase"],
    ["상속받음", "inheritance"],
    ["증여", "gift"],
    ["교환", "other"]
  ])("normalizes acquisition method %s", (rawMethod, expected) => {
    const result = normalizeAcquisitionMethodInput(rawMethod);

    expect(result.method).toBe(expected);
  });

  it.each([
    ["네", true, "true"],
    ["아니요", false, "false"],
    ["없어요", false, "false"],
    ["모름", null, "unknown"]
  ])("normalizes boolean answer %s", (rawValue, value, normalized) => {
    const result = normalizeBooleanInput(rawValue);

    expect(result.value).toBe(value);
    expect(result.normalized).toBe(normalized);
  });

  it.each([
    ["2년", 2, 24],
    ["2년 6개월", 2, 30],
    ["30개월", 2, 30],
    ["거주 안 함", 0, 0]
  ])("normalizes duration %s", (rawDuration, residenceYears, totalMonths) => {
    const result = normalizeDurationInput(rawDuration);

    expect(result.residenceYears).toBe(residenceYears);
    expect(result.totalMonths).toBe(totalMonths);
  });

  it.each([
    ["단독명의", { type: "solo" }],
    [
      "저 60 배우자 40 공동명의",
      {
        type: "joint",
        owners: [
          { ownerId: "owner1", sharePercent: 60 },
          { ownerId: "owner2", sharePercent: 40 }
        ]
      }
    ],
    [
      "부부 반반",
      {
        type: "joint",
        owners: [
          { ownerId: "owner1", sharePercent: 50 },
          { ownerId: "owner2", sharePercent: 50 }
        ]
      }
    ]
  ])("normalizes ownership %s", (rawOwnership, expected) => {
    const result = normalizeOwnershipInput(rawOwnership);

    expect(result.ownership).toEqual(expected);
  });

  it.each([
    ["취득세 1200만원 증빙 있음", "acquisition_tax", 12_000_000, "available"],
    ["복비 500만원 영수증 있음", "brokerage_fee", 5_000_000, "available"],
    ["법무사비 100만원", "legal_fee", 1_000_000, "unknown"],
    ["샷시 2천만원 증빙 있음", "capital_expenditure", 20_000_000, "available"]
  ])("normalizes expense %s", (rawExpense, type, amount, evidenceStatus) => {
    const result = normalizeExpenseInput(rawExpense);

    expect(result.expense).toMatchObject({ type, amount, evidenceStatus });
  });
});
