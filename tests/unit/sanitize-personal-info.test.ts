import { describe, expect, it } from "vitest";
import { sanitizePersonalInfo } from "../../src/tools/sanitize-personal-info.js";

describe("sanitizePersonalInfo", () => {
  describe("주민등록번호", () => {
    it("기본 형식을 마스킹한다", () => {
      const { sanitizedText, maskedItems } = sanitizePersonalInfo(
        "주민등록번호: 800101-1234567"
      );
      expect(sanitizedText).toBe("주민등록번호: 800101-*******");
      expect(maskedItems).toEqual([
        { type: "주민(외국인)등록번호", count: 1 }
      ]);
    });

    it("문장 중간에 포함된 경우를 마스킹한다", () => {
      const { sanitizedText } = sanitizePersonalInfo(
        "매도인 홍길동(900505-1111111)은 아래 부동산을 양도합니다."
      );
      expect(sanitizedText).toContain("900505-*******");
      expect(sanitizedText).not.toContain("1111111");
    });

    it("OCR 오인식으로 구분자 앞뒤에 공백이 있는 경우를 마스킹한다", () => {
      const { sanitizedText } = sanitizePersonalInfo("800101 - 1234567");
      expect(sanitizedText).toBe("800101-*******");
    });

    it("외국인등록번호(뒷자리 5~8 시작)를 마스킹한다", () => {
      const { sanitizedText } = sanitizePersonalInfo("840315-6123456");
      expect(sanitizedText).toBe("840315-*******");
    });

    it("여러 개를 모두 마스킹하고 count를 정확히 반환한다", () => {
      const { maskedItems } = sanitizePersonalInfo(
        "매도인: 800101-1234567, 매수인: 900202-2345678"
      );
      const rrnItem = maskedItems.find(
        (m) => m.type === "주민(외국인)등록번호"
      );
      expect(rrnItem?.count).toBe(2);
    });
  });

  describe("이름", () => {
    it("성명 레이블 뒤 이름을 마스킹한다", () => {
      const { sanitizedText } = sanitizePersonalInfo("성명: 홍길동");
      expect(sanitizedText).toBe("성명: ***");
    });

    it("매도인·매수인 레이블 뒤 이름을 마스킹한다", () => {
      const { sanitizedText } = sanitizePersonalInfo(
        "매도인: 김철수\n매수인: 이영희"
      );
      expect(sanitizedText).toContain("매도인: ***");
      expect(sanitizedText).toContain("매수인: ***");
    });

    it("레이블 없이 단독으로 등장하는 이름은 마스킹하지 않는다", () => {
      const { sanitizedText } = sanitizePersonalInfo("홍길동");
      expect(sanitizedText).toBe("홍길동");
    });

    it("레이블과 이름 사이에 공백이 여러 개 있어도 처리한다", () => {
      const { sanitizedText } = sanitizePersonalInfo("소유자:   박민준");
      expect(sanitizedText).toBe("소유자: ***");
    });
  });

  describe("전화번호", () => {
    it("010 휴대폰 번호를 마스킹한다", () => {
      const { sanitizedText } = sanitizePersonalInfo("010-1234-5678");
      expect(sanitizedText).toBe("010-****-****");
    });

    it("지역번호(02) 전화번호를 마스킹한다", () => {
      const { sanitizedText } = sanitizePersonalInfo("02-1234-5678");
      expect(sanitizedText).toBe("02-****-****");
    });

    it("하이픈 없이 붙어있는 번호를 마스킹한다", () => {
      const { sanitizedText } = sanitizePersonalInfo("01012345678");
      expect(sanitizedText).toBe("010-****-****");
    });
  });

  describe("계좌번호", () => {
    it("계좌번호 레이블이 있는 경우 마스킹한다", () => {
      const { sanitizedText } = sanitizePersonalInfo(
        "계좌번호: 110-123-456789"
      );
      expect(sanitizedText).toContain("[계좌번호 마스킹]");
      expect(sanitizedText).not.toContain("456789");
    });

    it("레이블 없는 숫자는 계좌번호로 마스킹하지 않는다", () => {
      const { sanitizedText } = sanitizePersonalInfo("거래금액: 500,000,000원");
      expect(sanitizedText).toBe("거래금액: 500,000,000원");
    });
  });

  describe("복합 케이스", () => {
    it("계약서 형식의 텍스트에서 여러 항목을 동시에 마스킹한다", () => {
      const contractText = [
        "매도인: 홍길동",
        "주민등록번호: 800101-1234567",
        "전화번호: 010-9876-5432",
        "계좌번호: 110-456-789012",
        "매매대금: 500,000,000원"
      ].join("\n");

      const { sanitizedText, maskedItems } = sanitizePersonalInfo(contractText);

      expect(sanitizedText).toContain("매도인: ***");
      expect(sanitizedText).toContain("800101-*******");
      expect(sanitizedText).toContain("010-****-****");
      expect(sanitizedText).toContain("[계좌번호 마스킹]");
      expect(sanitizedText).toContain("500,000,000원");
      expect(maskedItems.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe("경고 메시지", () => {
    it("마스킹 항목이 없으면 warning을 반환한다", () => {
      const { warning } = sanitizePersonalInfo("계약일: 2024년 3월 1일");
      expect(warning).toBeDefined();
    });

    it("마스킹 항목이 있으면 warning을 반환하지 않는다", () => {
      const { warning } = sanitizePersonalInfo("800101-1234567");
      expect(warning).toBeUndefined();
    });
  });
});
