# MCP 도구 계약

## 1. `sanitize_contract_text`

계약서 OCR 텍스트의 주민등록번호, 이름, 전화번호, 계좌번호를 마스킹합니다.

- 계약서 이미지를 분석할 때 가장 먼저 호출합니다.
- 이후 도구에는 원문이 아니라 마스킹된 텍스트만 전달합니다.
- 결과의 `sanitizedText`를 `extract_contract_case_fields` 입력으로 사용할 수 있습니다.

## 2. `extract_contract_case_fields`

마스킹된 계약서 OCR 텍스트에서 계산 후보값을 추출합니다.

- 입력 텍스트는 반드시 `sanitize_contract_text` 결과여야 합니다.
- `documentType`이 `transfer`이면 일반 `계약일`, `매매대금`을 양도 후보값으로 배정합니다.
- `documentType`이 `acquisition`이면 일반 `계약일`, `매매대금`을 취득 후보값으로 배정합니다.
- `documentType`이 `unknown`이면 일반 계약일과 매매대금은 자동 배정하지 않고 경고만 반환합니다.
- 반환되는 `partialCaseData`는 `validate_capital_gains_case`의 `caseData`와 호환됩니다.
- 추출값은 후보값이므로 체크리스트와 검증 도구를 반드시 거칩니다.

주요 반환 내용:

- `partialCaseData`: 기존 검증 도구에 병합 가능한 부분 사건 데이터
- `extractedFields`: 필드명, 값, OCR 근거 텍스트, 신뢰도
- `unresolvedFields`: 추가 질문이 필요한 필드
- `questions`: 사용자에게 물어볼 질문
- `warnings`: 문서 유형 불명확, OCR 품질 등 주의사항

## 3. `prepare_capital_gains_case_checklist`

계산 전 누락값과 위험 항목을 확인합니다.

- `extract_contract_case_fields`의 `partialCaseData`와 사용자 답변을 누적해 입력합니다.
- 값을 임의로 추정하지 않습니다.
- 기존 계산 도구의 필드명을 그대로 사용합니다.
- `validationPreview`로 현재 입력의 검증 상태를 함께 반환합니다.

주요 체크 항목:

- 양도일, 취득일, 양도가액, 취득가액
- 취득 방법과 현재 지원 여부
- 자산 종류와 토지 사업용 여부
- 단독명의·공동명의와 지분율
- 주택 수, 거주기간, 조정대상지역 여부
- 1세대 1주택 비과세 요청과 전문가 검증 여부
- 동일 과세연도 다른 양도 여부
- 필요경비와 증빙 보유 여부

## 4. `validate_capital_gains_case`

계산 전에 입력값과 지원 범위를 확인합니다.

- 일부 필드만 전달해도 됩니다.
- 누락값을 임의로 추정하지 않습니다.
- `validForCalculation=false`이면 계산 도구를 호출하지 않습니다.
- `unsupported`는 현재 엔진이 처리하지 않는 사건입니다.
- 규칙 적용기간과 양도일이 일치하지 않으면 계산할 수 없습니다.
- 1세대 1주택 비과세는 주택·1주택 조건과 세무전문가 검증이 모두 확인되어야 합니다.
- 필요경비는 지원되는 항목이며 증빙 보유가 확인된 경우에만 계산합니다.
- 거주기간은 보유기간을 초과할 수 없습니다.

주요 결과 상태:

- `complete`: 입력 검증 통과
- `needs_review`: 계산은 가능하지만 세무전문가 확인 필요
- `invalid`: 필수값 또는 형식 오류
- `unsupported`: 현재 버전 미지원

## 5. `calculate_capital_gains_tax`

완전한 사건 데이터를 받아 결정론적으로 계산합니다.

반환 내용:

- 규칙 버전과 기준일
- 단독명의 또는 공동명의 결과
- 양도소득세·개인지방소득세·합계
- 구조화된 계산 단계
- 적용 가정과 경고

이 도구는 누락값을 채우거나 미지원 사건을 억지로 계산하지 않습니다.

## 6. `list_supported_capital_gains_scenarios`

지원 규칙 기준일, 지원 사건, 미지원 사건을 반환합니다.
