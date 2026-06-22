import { calculateCapitalGainsTax } from "../domain/calculator.js";
import type { CapitalGainsCase } from "../domain/types.js";

export function runCalculation(caseData: CapitalGainsCase) {
  return calculateCapitalGainsTax(caseData);
}
