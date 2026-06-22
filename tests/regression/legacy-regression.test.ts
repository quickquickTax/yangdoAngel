import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { calculateCapitalGainsTax } from "../../src/domain/calculator.js";
import type { AssetSubType, CapitalGainsCase } from "../../src/domain/types.js";

interface LegacyFixture {
  id: string;
  input: {
    transferPrice: number;
    acquisitionPrice: number;
    necessaryExpense: number;
    acquisitionDate: string;
    transferDate: string;
    residenceYears: number;
    assetSubType: AssetSubType;
    houseCount: number;
    isAdjustedArea: boolean;
    isUnregistered: boolean;
    is1h1h: boolean;
  };
  expected: {
    holdingYears: number;
    exempt: boolean;
    transferGain: number;
    ltcAmount: number;
    capitalGainAmt: number;
    basicDeduction: number;
    taxBase: number;
    incomeTax: number;
    localTax: number;
    totalTax: number;
    rateType: string | null;
  };
}

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = JSON.parse(
  readFileSync(resolve(here, "../fixtures/legacy-regression.json"), "utf8")
) as LegacyFixture[];

function convert(fixture: LegacyFixture): CapitalGainsCase {
  const input = fixture.input;
  return {
    ruleDate: "2026-04-21",
    asset: {
      subType: input.assetSubType,
      domestic: true,
      registered: !input.isUnregistered
    },
    transfer: { date: input.transferDate, price: input.transferPrice },
    acquisition: {
      date: input.acquisitionDate,
      price: input.acquisitionPrice,
      method: "purchase"
    },
    expenses:
      input.necessaryExpense > 0
        ? [
            {
              type: "capital_expenditure",
              amount: input.necessaryExpense,
              evidenceStatus: "available"
            }
          ]
        : [],
    ownership: { type: "solo", basicDeductionAlreadyUsed: 0 },
    household: {
      houseCount: Math.max(1, input.houseCount),
      residenceYears: input.residenceYears,
      isAdjustedArea: input.isAdjustedArea,
      oneHouseExemptionClaimed: input.is1h1h,
      exemptionVerificationStatus: input.is1h1h
        ? "verified_by_tax_professional"
        : "not_eligible"
    },
    annualContext: { otherTransfersExist: false }
  };
}

describe("legacy calculator regression", () => {
  it.each(fixtures)("matches legacy numeric outputs: $id", (fixture) => {
    const result = calculateCapitalGainsTax(convert(fixture));
    const actual = result.result;
    expect(actual).toBeDefined();
    expect(actual?.holdingYears).toBe(fixture.expected.holdingYears);
    expect(actual?.exempt).toBe(fixture.expected.exempt);
    expect(actual?.transferGain).toBe(fixture.expected.transferGain);
    expect(actual?.longTermDeductionAmount).toBe(fixture.expected.ltcAmount);
    expect(actual?.capitalGainIncome).toBe(fixture.expected.capitalGainAmt);
    expect(actual?.basicDeduction).toBe(fixture.expected.basicDeduction);
    expect(actual?.taxBase).toBe(fixture.expected.taxBase);
    expect(actual?.incomeTax).toBe(fixture.expected.incomeTax);
    expect(actual?.localIncomeTax).toBe(fixture.expected.localTax);
    expect(actual?.totalTax).toBe(fixture.expected.totalTax);
  });
});
