import { describe, expect, it } from "vitest";
import { prepareCapitalGainsCaseChecklist } from "../../src/tools/prepare-capital-gains-case-checklist.js";

function completeCase() {
  return {
    ruleDate: "2026-04-21",
    asset: { subType: "housing" },
    transfer: { date: "2026-06-01", price: 600_000_000 },
    acquisition: {
      date: "2018-01-01",
      price: 300_000_000,
      method: "purchase"
    },
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

describe("prepareCapitalGainsCaseChecklist", () => {
  it("returns required missing questions for partial case data", () => {
    const result = prepareCapitalGainsCaseChecklist({
      transfer: { date: "2026-06-01", price: 600_000_000 }
    });

    expect(result.status).toBe("needs_input");
    expect(result.nextTool).toBe("validate_capital_gains_case");
    expect(result.checklistItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "acquisition.date",
          requiredForCalculation: true,
          status: "missing"
        }),
        expect.objectContaining({
          field: "annualContext.otherTransfersExist",
          requiredForCalculation: true,
          status: "missing"
        })
      ])
    );
    expect(result.questions).toContain("취득일 또는 취득 잔금일은 언제입니까?");
    expect(result.questionGroups.map((group) => group.category)).toEqual([
      "transaction",
      "asset",
      "ownership",
      "household",
      "annual",
      "expense",
      "support",
      "validation"
    ]);
    expect(result.questionGroups).toContainEqual(
      expect.objectContaining({
        category: "transaction",
        title: "거래 정보",
        requiredCount: 2,
        questions: expect.arrayContaining([
          expect.objectContaining({
            field: "acquisition.date",
            question: "취득일 또는 취득 잔금일은 언제입니까?",
            source: "checklist"
          })
        ])
      })
    );
    expect(result.questionGroups).toContainEqual(
      expect.objectContaining({
        category: "validation",
        questions: expect.arrayContaining([
          expect.objectContaining({
            field: null,
            source: "validation",
            status: "validation_question"
          })
        ])
      })
    );
  });

  it("marks a complete supported case as ready for calculation after validation", () => {
    const result = prepareCapitalGainsCaseChecklist(completeCase());

    expect(result.status).toBe("ready_for_validation");
    expect(result.nextTool).toBe("calculate_capital_gains_tax");
    expect(result.validationPreview.validForCalculation).toBe(true);
    expect(result.checklistItems).toContainEqual(
      expect.objectContaining({
        field: "expenses",
        requiredForCalculation: false,
        status: "needs_review"
      })
    );
    expect(result.questionGroups).toEqual([
      expect.objectContaining({
        category: "expense",
        reviewCount: 1,
        requiredCount: 0,
        questions: [
          expect.objectContaining({
            field: "expenses",
            status: "needs_review"
          })
        ]
      })
    ]);
  });

  it("asks for gift valuation and relationship details before calculation", () => {
    const input = completeCase();
    input.acquisition.method = "gift";
    const result = prepareCapitalGainsCaseChecklist(input);

    expect(result.status).toBe("needs_input");
    expect(result.checklistItems).toContainEqual(
      expect.objectContaining({
        field: "acquisition.valuation",
        status: "missing"
      })
    );
    expect(result.validationPreview.status).toBe("invalid");
    expect(result.questionGroups).toContainEqual(
      expect.objectContaining({
        category: "transaction",
        questions: expect.arrayContaining([
          expect.objectContaining({
            field: "giftDetails.donorRelationship",
            status: "missing"
          })
        ])
      })
    );
  });
});
