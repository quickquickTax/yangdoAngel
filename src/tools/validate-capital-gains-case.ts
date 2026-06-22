import type { CapitalGainsCase } from "../domain/types.js";
import { validateCapitalGainsCase } from "../domain/validation.js";
import { CapitalGainsCaseSchema } from "./schemas.js";

export function runValidation(caseData: Record<string, unknown>) {
  const parsed = CapitalGainsCaseSchema.safeParse(caseData);
  if (parsed.success) {
    return validateCapitalGainsCase(parsed.data);
  }

  let domainResult;
  try {
    domainResult = validateCapitalGainsCase(
      caseData as unknown as Partial<CapitalGainsCase>
    );
  } catch {
    domainResult = {
      status: "invalid" as const,
      validForCalculation: false,
      issues: [],
      questions: []
    };
  }

  const schemaIssues = parsed.error.issues.map((issue) => ({
    severity: "error" as const,
    code: "SCHEMA_INVALID",
    message: issue.message,
    ...(issue.path.length > 0 ? { field: issue.path.join(".") } : {})
  }));

  return {
    status: domainResult.status === "unsupported" ? "unsupported" as const : "invalid" as const,
    validForCalculation: false,
    issues: [...domainResult.issues, ...schemaIssues],
    questions: domainResult.questions
  };
}
