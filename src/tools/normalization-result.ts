export interface StandardNormalizationFields<T> {
  targetField: string;
  normalizedValue: T | null;
  readyForCaseData: boolean;
}

export function standardFields<T>(
  targetField: string,
  normalizedValue: T | null,
  readyForCaseData: boolean
): StandardNormalizationFields<T> {
  return {
    targetField,
    normalizedValue,
    readyForCaseData
  };
}
