import type { VerificationStatus } from "../domain/types.js";

export interface ExemptionVerificationNormalizationResult {
  rawStatus: string;
  status: VerificationStatus | null;
  confidence: "high" | "low";
  warnings: string[];
}

function compact(value: string): string {
  return value.trim().replace(/\s+/g, "");
}

export function normalizeExemptionVerificationInput(
  rawStatus: string
): ExemptionVerificationNormalizationResult {
  const value = compact(rawStatus);

  if (!value) {
    return {
      rawStatus,
      status: null,
      confidence: "low",
      warnings: ["비과세 검증 상태 입력값이 비어 있습니다."]
    };
  }

  if (/세무사|세무전문가|전문가|검증완료|확인완료|검토완료/.test(value)) {
    return {
      rawStatus,
      status: "verified_by_tax_professional",
      confidence: "high",
      warnings: []
    };
  }

  if (/일부|부분|대략|간단히/.test(value)) {
    return {
      rawStatus,
      status: "partially_verified",
      confidence: "high",
      warnings: ["일부 검증 상태이므로 비과세 계산 전 세무전문가 최종 확인이 필요합니다."]
    };
  }

  if (/해당없|대상아님|비과세안|신청안|요청안|미신청|불가|안돼/.test(value)) {
    return {
      rawStatus,
      status: "not_eligible",
      confidence: "high",
      warnings: []
    };
  }

  if (/미검증|확인안|검토전|아직|안했|안받/.test(value)) {
    return {
      rawStatus,
      status: "not_verified",
      confidence: "high",
      warnings: ["비과세 요건이 검증되지 않았습니다."]
    };
  }

  if (/모름|모르|몰라|불명|미확인|확인필요|unknown/i.test(value)) {
    return {
      rawStatus,
      status: "unknown",
      confidence: "high",
      warnings: ["비과세 검증 상태를 확인해야 합니다."]
    };
  }

  return {
    rawStatus,
    status: null,
    confidence: "low",
    warnings: [
      "비과세 검증 상태를 검증 완료, 일부 검증, 미검증, 해당 없음, 모름 중 하나로 해석할 수 없습니다."
    ]
  };
}
