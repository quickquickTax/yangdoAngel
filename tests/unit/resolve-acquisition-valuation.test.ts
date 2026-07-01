import { describe, expect, it } from "vitest";
import {
  getEvaluationWindow,
  resolveAcquisitionValuation
} from "../../src/tools/resolve-acquisition-valuation.js";

describe("resolveAcquisitionValuation", () => {
  it("uses different inheritance and gift evaluation windows", () => {
    expect(getEvaluationWindow("inheritance", "2026-08-31")).toEqual({
      from: "2026-02-28",
      to: "2027-02-28"
    });
    expect(getEvaluationWindow("gift", "2026-08-31")).toEqual({
      from: "2026-02-28",
      to: "2026-11-30"
    });
  });

  it("prefers a user-provided determined valuation and returns a case patch", async () => {
    const result = await resolveAcquisitionValuation({
      acquisitionMethod: "inheritance",
      acquisitionDate: "2026-01-01",
      property: { type: "apartment", address: "서울시 예시구 예시로 1" },
      knownEvidence: [
        {
          amount: 400_000_000,
          basis: "standard_price",
          status: "determined",
          referenceDate: "2026-01-01",
          sourceId: "assessment-1"
        }
      ]
    });
    expect(result.status).toBe("resolved");
    expect(result.selectedValuation).toEqual(
      expect.objectContaining({ amount: 400_000_000, status: "determined" })
    );
    expect(result.caseDataPatch).toEqual(
      expect.objectContaining({
        acquisition: expect.objectContaining({ price: 400_000_000 })
      })
    );
  });

  it("does not select an unverified similar-property transaction", async () => {
    const result = await resolveAcquisitionValuation({
      acquisitionMethod: "gift",
      acquisitionDate: "2026-01-01",
      property: { type: "apartment", address: "서울시 예시구 예시로 1" },
      knownEvidence: [
        {
          amount: 450_000_000,
          basis: "similar_transaction",
          status: "user_confirmed",
          referenceDate: "2026-01-10"
        }
      ]
    });

    expect(result.status).toBe("needs_user_confirmation");
    expect(result.selectedValuation).toBeNull();
    expect(result.candidates).toHaveLength(1);
  });

  it("selects a similar-property transaction after both five-percent checks", async () => {
    const result = await resolveAcquisitionValuation({
      acquisitionMethod: "gift",
      acquisitionDate: "2026-01-01",
      property: { type: "apartment", address: "서울시 예시구 예시로 1" },
      knownEvidence: [
        {
          amount: 450_000_000,
          basis: "similar_transaction",
          status: "user_confirmed",
          referenceDate: "2026-01-10",
          similarPropertyMatch: {
            areaDiffPercent: 2.5,
            standardPriceDiffPercent: 4.9
          }
        }
      ]
    });

    expect(result.status).toBe("resolved");
    expect(result.selectedValuation?.amount).toBe(450_000_000);
  });
});
