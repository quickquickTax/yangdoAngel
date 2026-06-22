# PlayMCP in Kakao Cloud 배포

공모전 제출용 카카오클라우드 이미지는 `Dockerfile.kakao`를 사용합니다. 이 이미지는 `MCP_PUBLIC_MODE=true`로 고정되어 API 키나 별도 환경변수 없이 Streamable HTTP 서버가 시작됩니다.

## 로컬 검증

```powershell
npm ci
npm run check
npm run smoke:http:kakao
```

Docker 이미지 검증:

```powershell
docker build --platform linux/amd64 `
  -f Dockerfile.kakao `
  -t kr-capital-gains-tax-mcp:kakao .
```

카카오클라우드는 `linux/amd64` 이미지를 요구합니다.

## Git 소스로 등록

1. 수정된 프로젝트를 GitHub 등의 Git 저장소에 올립니다.
2. https://playmcp.kakaocloud.io 에 접속합니다.
3. `+ 새 MCP 서버 등록`에서 `Git 소스 빌드`를 선택합니다.
4. Git 저장소 URL과 브랜치를 입력합니다.
5. Dockerfile 경로에 `Dockerfile.kakao`를 입력합니다.
6. 공개 저장소라면 PAT는 비워둡니다.
7. 등록 후 상태가 `Active`가 될 때까지 기다립니다.
8. 상세 화면에서 Endpoint URL을 복사합니다.

## PlayMCP 등록

1. https://playmcp.kakao.com/console 에서 `새로운 MCP 서버 등록`을 선택합니다.
2. MCP Endpoint에 카카오클라우드에서 발급된 URL을 입력합니다.
3. API 키나 Authorization 헤더는 설정하지 않습니다.
4. `정보 불러오기`가 성공하는지 확인합니다.
5. 먼저 `임시 등록`하고 AI 채팅에서 검증합니다.
6. 검증 후 `심사 요청`합니다.
7. 승인되면 공개 상태를 `전체 공개`로 변경합니다.

## 보안 특성

- 서버는 사용자 계정이나 입력 데이터를 저장하지 않습니다.
- 요청 본문을 로그에 기록하지 않습니다.
- 계산 도구는 외부 시스템을 변경하지 않습니다.
- Endpoint를 아는 호출자는 누구나 접근할 수 있으므로 카카오클라우드 공모전 배포에만 이 이미지를 사용합니다.
- 일반 인터넷 배포에는 API 키가 기본인 `Dockerfile`을 사용합니다.

## 실행 모드 비교

| 용도 | Dockerfile | 인증 모드 | API 키 |
| --- | --- | --- | --- |
| 카카오 공모전 | `Dockerfile.kakao` | `none` | 불필요 |
| Cloud Run 등 일반 배포 | `Dockerfile` | `bearer` | 필수 |
