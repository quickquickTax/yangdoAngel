# 원격 MCP 배포

원격 서버는 MCP Streamable HTTP를 사용합니다.

- MCP URL: `POST /mcp`
- 상태 확인: `GET /health`
- 인증: `Authorization: Bearer <MCP_API_KEY>`
- 세션: stateless

## 환경변수

| 이름 | 필수 | 기본값 | 설명 |
| --- | --- | --- | --- |
| `MCP_API_KEY` | 예 | 없음 | 32자 이상의 비밀 키 |
| `HOST` | 아니요 | `0.0.0.0` | 수신 주소 |
| `PORT` | 아니요 | `3000` | 수신 포트 |
| `ALLOWED_HOSTS` | 운영 권장 | 없음 | 허용할 배포 호스트명, 쉼표 구분 |
| `DATA_GO_KR_SERVICE_KEY` | 평가 조회 시 | 없음 | 국토교통부 실거래가 API 서비스 키 |
| `JUSO_API_KEY` | 주소 조회 시 | 없음 | 도로명주소 검색 API 승인 키 |
| `VWORLD_API_KEY` | 공시가격 조회 시 | 없음 | VWorld 데이터 API 키 |
| `VWORLD_DATASET_APARTMENT_PRICE` | 해당 자산 조회 시 | 없음 | 공동주택가격 데이터셋 ID |
| `VWORLD_DATASET_INDIVIDUAL_HOUSE_PRICE` | 해당 자산 조회 시 | 없음 | 개별주택가격 데이터셋 ID |
| `VWORLD_DATASET_INDIVIDUAL_LAND_PRICE` | 해당 자산 조회 시 | 없음 | 개별공시지가 데이터셋 ID |
| `VWORLD_DATASET_COMMERCIAL_STANDARD_PRICE` | 해당 자산 조회 시 | 없음 | 상업용·오피스텔 기준시가 데이터셋 ID |
| `VWORLD_DATASET_BUILDING_STANDARD_PRICE` | 해당 자산 조회 시 | 없음 | 일반건물 기준시가 데이터셋 ID |

비밀 키는 소스나 Docker 이미지에 넣지 말고 배포 플랫폼의 Secret 기능으로 저장합니다.

## 로컬 HTTP 실행

PowerShell 예시:

```powershell
$env:MCP_API_KEY = '<32자 이상의 임의 비밀 키>'
$env:HOST = '127.0.0.1'
$env:ALLOWED_HOSTS = '127.0.0.1'
npm run build
npm run start:http
```

상태 확인:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/health
```

HTTP MCP 통합 테스트:

```powershell
npm run smoke:http
```

## Docker 실행

```powershell
docker build -t kr-capital-gains-tax-mcp .
docker run --rm -p 3000:3000 `
  -e MCP_API_KEY='<32자 이상의 임의 비밀 키>' `
  -e ALLOWED_HOSTS='localhost' `
  kr-capital-gains-tax-mcp
```

운영 플랫폼에는 컨테이너 포트 `3000`, 상태 확인 경로 `/health`를 설정합니다. 플랫폼이 제공하는 HTTPS URL 뒤에 `/mcp`를 붙인 주소가 원격 MCP URL입니다.

Google Cloud Run에 실제 공개 URL을 만드는 전체 절차는 `docs/cloud-run-deployment.md`를 참고합니다.

## 클라이언트 연결

클라이언트가 사용자 지정 HTTP 헤더를 지원하면 다음 값을 등록합니다.

```json
{
  "url": "https://tax-mcp.example.com/mcp",
  "headers": {
    "Authorization": "Bearer YOUR_API_KEY"
  }
}
```

클라이언트마다 설정 형식은 다를 수 있습니다. URL만 받고 헤더를 지원하지 않는 클라이언트에는 이 API 키 방식으로 연결할 수 없으며, OAuth를 지원하는 인증 프록시 또는 OAuth 서버가 추가로 필요합니다.

## 운영 보안

- HTTPS를 제공하는 플랫폼이나 리버스 프록시 뒤에서만 공개합니다.
- `MCP_API_KEY`는 사용자별로 분리하고 주기적으로 교체합니다.
- 요청 본문에는 재무정보가 있으므로 본문을 로그에 기록하지 않습니다.
- `ALLOWED_HOSTS`에 실제 배포 도메인을 지정합니다.
- 플랫폼에서 요청 제한, 접근 로그 비식별화, 방화벽 정책을 설정합니다.
- 현재 세법 규칙은 `pending_professional_review`이므로 실무 확정세액 서비스로 표시하지 않습니다.
