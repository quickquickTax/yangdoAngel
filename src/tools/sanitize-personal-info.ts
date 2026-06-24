export interface MaskedItem {
  type: string;
  count: number;
}

export interface SanitizeResult {
  sanitizedText: string;
  maskedItems: MaskedItem[];
  warning?: string;
}

// 주민등록번호 / 외국인등록번호: 6자리 구분자 7자리 (1~8로 시작)
// OCR 오인식 대비 구분자 앞뒤 공백 허용
const RRN_PATTERN = /(\d{6})\s*[-–—]\s*([1-8]\d{6})/g;

// 이름: 성명·매도인·매수인 등 레이블 뒤에 오는 한글 2~5자
// 레이블 없는 단독 이름은 오탐 위험이 높아 제외
const NAME_LABEL_PATTERN =
  /(성\s*명|매도\s*인|매수\s*인|양도\s*인|양수\s*인|임대\s*인|임차\s*인|소유\s*자|계약\s*자|대리\s*인|피상속\s*인)\s*[:：]\s*([가-힣]{2,5})/g;

// 전화번호: 010/011/016~019, 02(서울), 031~099(지역)
const PHONE_PATTERN = /\b(01[016789]|02|0[3-9]\d)\s*[-.\s]?\s*(\d{3,4})\s*[-.\s]?\s*(\d{4})\b/g;

// 계좌번호: 레이블 뒤에 오는 숫자+구분자 패턴 (레이블 없이는 거래금액 등과 구분 불가)
const ACCOUNT_PATTERN =
  /(계좌\s*번호|통장\s*번호|입금\s*계좌|입금처)\s*[:：]?\s*([\d][\d\s-]{8,24}[\d])/g;

export function sanitizePersonalInfo(text: string): SanitizeResult {
  const counts: Record<string, number> = {};
  let result = text;

  // 주민·외국인등록번호: 뒷자리 전체 마스킹, 앞 6자리는 유지
  result = result.replace(RRN_PATTERN, (_, front) => {
    const key = "주민(외국인)등록번호";
    counts[key] = (counts[key] ?? 0) + 1;
    return `${front}-*******`;
  });

  // 이름: 레이블은 유지, 이름만 ***으로 치환
  result = result.replace(NAME_LABEL_PATTERN, (_, label) => {
    counts["이름"] = (counts["이름"] ?? 0) + 1;
    return `${label}: ***`;
  });

  // 전화번호: 가운데·끝자리 마스킹
  result = result.replace(PHONE_PATTERN, (_, area) => {
    counts["전화번호"] = (counts["전화번호"] ?? 0) + 1;
    return `${area}-****-****`;
  });

  // 계좌번호: 번호 전체를 [계좌번호 마스킹]으로 치환
  result = result.replace(ACCOUNT_PATTERN, (_, label) => {
    counts["계좌번호"] = (counts["계좌번호"] ?? 0) + 1;
    return `${label}: [계좌번호 마스킹]`;
  });

  const maskedItems = Object.entries(counts).map(([type, count]) => ({
    type,
    count
  }));

  const warning =
    maskedItems.length === 0
      ? "마스킹된 항목이 없습니다. 텍스트에 민감정보가 없거나, 레이블 없는 이름처럼 패턴으로 감지하기 어려운 경우일 수 있습니다. 계약서에 성명·주민등록번호가 포함되어 있다면 이미지 원본을 다시 확인하세요."
      : undefined;

  return { sanitizedText: result, maskedItems, ...(warning ? { warning } : {}) };
}
