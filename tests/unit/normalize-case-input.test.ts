import { describe, expect, it } from "vitest";
import { normalizeCaseInput } from "../../src/tools/normalize-case-input.js";

describe("normalizeCaseInput", () => {
  it("normalizes amount fields and returns a caseData patch", () => {
    const result = normalizeCaseInput("transfer.price", "7억 5천만");

    expect(result.normalizer).toBe("normalize_amount_input");
    expect(result.targetField).toBe("transfer.price");
    expect(result.normalizedValue).toBe(750_000_000);
    expect(result.readyForCaseData).toBe(true);
    expect(result.caseDataPatch).toEqual({
      transfer: { price: 750_000_000 }
    });
  });

  it("normalizes single date fields and returns a nested patch", () => {
    const result = normalizeCaseInput("acquisition.date", "250101");

    expect(result.normalizer).toBe("normalize_date_input");
    expect(result.normalizedValue).toBe("2025-01-01");
    expect(result.readyForCaseData).toBe(true);
    expect(result.caseDataPatch).toEqual({
      acquisition: { date: "2025-01-01" }
    });
  });

  it("does not mark a date range as ready for a single date field", () => {
    const result = normalizeCaseInput("transfer.date", "20250101~20260101");

    expect(result.normalizedValue).toBeNull();
    expect(result.readyForCaseData).toBe(false);
    expect(result.caseDataPatch).toBeNull();
    expect(result.warnings).toContain(
      "transfer.date에는 단일 날짜가 필요합니다. 기간 중 적용할 날짜를 확인해 주세요."
    );
  });

  it("normalizes boolean target fields with their exact caseData path", () => {
    const result = normalizeCaseInput("annualContext.otherTransfersExist", "아니요");

    expect(result.normalizer).toBe("normalize_boolean_input");
    expect(result.normalizedValue).toBe(false);
    expect(result.readyForCaseData).toBe(true);
    expect(result.caseDataPatch).toEqual({
      annualContext: { otherTransfersExist: false }
    });
  });

  it("normalizes expenses as an appendable expenses patch", () => {
    const result = normalizeCaseInput("expenses[]", "취득세 1200만원 증빙 있음");

    expect(result.normalizer).toBe("normalize_expense_input");
    expect(result.readyForCaseData).toBe(true);
    expect(result.caseDataPatch).toEqual({
      expenses: [
        {
          type: "acquisition_tax",
          amount: 12_000_000,
          evidenceStatus: "available",
          description: "취득세 1200만원 증빙 있음"
        }
      ]
    });
  });
});
