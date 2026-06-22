import { calculateCapitalGainsTax } from "./domain/calculator.js";
import type { CapitalGainsCase } from "./domain/types.js";

const sample: CapitalGainsCase = {
  ruleDate: "2026-04-21",
  asset: {
    subType: "housing",
    domestic: true,
    registered: true
  },
  transfer: {
    date: "2026-06-01",
    price: 600_000_000
  },
  acquisition: {
    date: "2018-01-01",
    price: 300_000_000,
    method: "purchase"
  },
  expenses: [
    {
      type: "brokerage_fee",
      amount: 20_000_000,
      evidenceStatus: "available"
    }
  ],
  ownership: {
    type: "solo",
    basicDeductionAlreadyUsed: 0
  },
  household: {
    houseCount: 1,
    residenceYears: 0,
    isAdjustedArea: false,
    oneHouseExemptionClaimed: false,
    exemptionVerificationStatus: "not_eligible"
  },
  annualContext: {
    otherTransfersExist: false
  }
};

console.log(JSON.stringify(calculateCapitalGainsTax(sample), null, 2));
