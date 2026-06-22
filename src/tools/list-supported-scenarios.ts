import { listSupportedRuleDates } from "../rules/rule-registry.js";

export function getSupportedScenarios() {
  return {
    serverVersion: "0.1.0",
    supportedRuleDates: listSupportedRuleDates(),
    supported: [
      "국내 부동산의 실지거래가액 기준 단일 양도",
      "일반 주택·건물·사업용 토지·비사업용 토지의 초기 계산 규칙",
      "단독명의 및 확정 지분 공동명의",
      "양도가액·취득가액·필요경비 직접 입력",
      "양도소득세 및 개인지방소득세 예상 계산"
    ],
    unsupported: [
      "동일 과세기간 복수 양도와 양도차손 통산",
      "상속·증여·부담부증여 취득",
      "환산취득가액 또는 취득가액 불명",
      "일시적 2주택·상속주택·혼인·동거봉양 등 특례",
      "조합원입주권·분양권",
      "감면·가산세·외국납부세액",
      "국외 자산·법인·비거주자",
      "전자신고 자동 제출"
    ],
    caution:
      "현재 규칙은 전문 검토 대기 상태로, 실무 사용 전 공식 법령과 신고 서식에 대한 조문별 검증이 필요합니다."
  };
}
