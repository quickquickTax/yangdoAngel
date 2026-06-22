import { calculateCapitalGainsTax } from "../domain/calculator.js";
import {
  applyServiceScope,
  type CapitalGainsCaseInput
} from "./schemas.js";

export function runCalculation(caseData: CapitalGainsCaseInput) {
  return calculateCapitalGainsTax(applyServiceScope(caseData));
}
