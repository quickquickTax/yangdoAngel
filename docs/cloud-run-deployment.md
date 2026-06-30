# Google Cloud Run 공개 URL 배포

이 절차는 프로젝트의 `Dockerfile`을 Cloud Build로 빌드하고 Cloud Run에 배포합니다. Cloud Run이 발급하는 `https://...run.app` 주소를 그대로 공개 MCP URL로 사용할 수 있습니다.

## 1. 사전 준비

1. Google Cloud 프로젝트를 만들고 결제 계정을 연결합니다.
2. Google Cloud CLI를 설치합니다.
3. PowerShell을 새로 열고 아래 프로젝트 폴더로 이동합니다.

```powershell
cd "C:\Users\user\OneDrive\Desktop\꿈\mcp\capital-gains-tax-mcp"
gcloud init
gcloud auth login
```

프로젝트 ID와 서울 리전을 설정합니다.

```powershell
$projectId = "YOUR_GOOGLE_CLOUD_PROJECT_ID"
$region = "asia-northeast3"
gcloud config set project $projectId
gcloud config set run/region $region
```

## 2. API 활성화

```powershell
gcloud services enable `
  run.googleapis.com `
  cloudbuild.googleapis.com `
  artifactregistry.googleapis.com `
  secretmanager.googleapis.com
```

## 3. 전용 서비스 계정 생성

```powershell
$serviceAccountName = "capital-gains-tax-mcp"
$serviceAccount = "$serviceAccountName@$projectId.iam.gserviceaccount.com"

gcloud iam service-accounts create $serviceAccountName `
  --display-name="Capital Gains Tax MCP"
```

이미 같은 이름의 계정이 있으면 생성 명령은 생략합니다.

## 4. API 키를 Secret Manager에 저장

32바이트 난수로 키를 생성합니다.

```powershell
$keyBytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Fill($keyBytes)
$apiKey = [Convert]::ToBase64String($keyBytes)
$secretFile = Join-Path $env:TEMP "capital-gains-tax-mcp-key.txt"
[IO.File]::WriteAllText($secretFile, $apiKey, [Text.UTF8Encoding]::new($false))
```

처음 생성할 때:

```powershell
gcloud secrets create mcp-api-key `
  --replication-policy=automatic `
  --data-file=$secretFile
```

이미 Secret이 존재하면 새 버전을 추가합니다.

```powershell
gcloud secrets versions add mcp-api-key --data-file=$secretFile
```

임시 파일을 삭제하고 런타임 서비스 계정에 읽기 권한을 부여합니다.

```powershell
Remove-Item -LiteralPath $secretFile

gcloud secrets add-iam-policy-binding mcp-api-key `
  --member="serviceAccount:$serviceAccount" `
  --role="roles/secretmanager.secretAccessor"
```

`$apiKey` 값은 MCP 클라이언트에도 필요하므로 암호 관리자에 저장합니다. 터미널을 닫으면 다시 Secret 값을 읽을 권한이 필요합니다.

## 5. 소스에서 Cloud Run으로 배포

```powershell
gcloud run deploy capital-gains-tax-mcp `
  --source . `
  --region $region `
  --service-account $serviceAccount `
  --allow-unauthenticated `
  --port 3000 `
  --set-env-vars HOST=0.0.0.0 `
  --set-secrets MCP_API_KEY=mcp-api-key:latest `
  --memory 512Mi `
  --cpu 1 `
  --concurrency 20 `
  --min-instances 0 `
  --max-instances 3 `
  --timeout 60
```

`--allow-unauthenticated`는 Cloud Run 계층의 공개 접근만 허용합니다. 애플리케이션의 `/mcp`는 여전히 Bearer API 키가 없으면 `401`을 반환합니다. `/health`만 인증 없이 접근할 수 있습니다.

처음 `--source` 배포할 때 Artifact Registry 저장소 생성 여부를 물으면 승인합니다.

## 6. 발급된 URL 확인

```powershell
$serviceUrl = gcloud run services describe capital-gains-tax-mcp `
  --region $region `
  --format="value(status.url)"

$mcpUrl = "$serviceUrl/mcp"
$serviceHost = ([Uri]$serviceUrl).Host

Write-Output "Health: $serviceUrl/health"
Write-Output "MCP:    $mcpUrl"
```

예상 형태:

```text
https://capital-gains-tax-mcp-xxxxxxxxxx-du.a.run.app/mcp
```

발급된 호스트만 허용하도록 서버를 한 번 갱신합니다.

```powershell
gcloud run services update capital-gains-tax-mcp `
  --region $region `
  --update-env-vars "ALLOWED_HOSTS=$serviceHost"
```

## 7. 공개 URL 검증

상태 확인:

```powershell
Invoke-RestMethod "$serviceUrl/health"
```

실제 MCP 초기화와 도구 호출까지 검사:

```powershell
$env:MCP_URL = $mcpUrl
$env:MCP_API_KEY = $apiKey
npm run smoke:http
```

성공하면 `HTTP_TOOLS`에 등록된 MCP 도구 목록이 표시됩니다.

## 8. 다른 PC에서 연결

사용하는 클라이언트의 원격 MCP 설정에 다음 값을 입력합니다.

```json
{
  "mcpServers": {
    "kr-capital-gains-tax": {
      "url": "https://발급된-run-app-주소/mcp",
      "headers": {
        "Authorization": "Bearer 발급한-API-키"
      }
    }
  }
}
```

API 키 헤더 입력을 지원하지 않고 URL만 받는 클라이언트에는 연결할 수 없습니다. 그런 클라이언트에는 OAuth 인증 계층이 필요합니다.

## 9. 업데이트 배포

코드를 수정하고 테스트한 뒤 같은 배포 명령을 다시 실행합니다.

```powershell
npm run check
npm run smoke:http

gcloud run deploy capital-gains-tax-mcp `
  --source . `
  --region $region
```

기존 서비스 설정과 URL은 유지되고 새 리비전이 생성됩니다.

## 10. 로그와 삭제

최근 로그 확인:

```powershell
gcloud run services logs read capital-gains-tax-mcp `
  --region $region `
  --limit 100
```

서비스 삭제:

```powershell
gcloud run services delete capital-gains-tax-mcp --region $region
```

서비스를 삭제해도 Secret과 빌드 이미지가 남을 수 있으므로 더 이상 사용하지 않으면 별도로 정리합니다.

## 공식 문서

- Cloud Run 배포: https://cloud.google.com/run/docs/deploying
- Cloud Run Secret 설정: https://cloud.google.com/run/docs/configuring/services/secrets
- `gcloud run deploy`: https://cloud.google.com/sdk/gcloud/reference/run/deploy
- Google Cloud CLI 설치: https://cloud.google.com/sdk/docs/install
