# GachiSallim Backend

GachiSallim 서비스의 NestJS 백엔드입니다. Prisma, PostgreSQL, ESLint, Prettier, AWS CDK를 사용합니다.

## 시작하기

```bash
npm install
cp .env.example .env
docker compose up -d
npm run prisma:generate
npm run start:dev
```

## 검증

```bash
npm run lint
npm run build
npm test
npm run cdk:synth
```

## Git 흐름

- 기본 브랜치: `main`
- 통합 브랜치: `develop`
- 기능 브랜치: `type/#issue-number/feature-name`
- 예시: `feat/#12/add-auth`, `fix/#34/validation-error`

스키마 변경에는 Prisma 마이그레이션을 사용합니다. 로컬에서는 `npm run prisma:migrate:dev`를 실행하고,
배포 또는 CI 환경에서는 `npm run prisma:migrate:deploy`를 실행합니다.

## 배포

CD는 CI가 성공한 `main`과 `develop` push만 처리합니다. GitHub Actions는 저장소에 장기 AWS
credential을 저장하지 않고 OIDC와 STS로 환경별 IAM 역할을 획득합니다.

- `main`: `api.gachisallim.com`, EC2 port `3000`, PostgreSQL database `gachisallim`, production Cognito User Pool
- `develop`: `dev-api.gachisallim.com`, EC2 port `3001`, PostgreSQL database `gachisallim_develop`, development Cognito User Pool
- 릴리스: ARM64 GitHub runner가 Node.js 런타임, 빌드 결과, production 의존성을 묶어 S3에 업로드
- 적용: Systems Manager가 환경별 systemd 서비스를 갱신하고 health check 실패 시 이전 릴리스로 복구
- 네트워크: private backend subnet의 EC2가 단일 `t4g.nano` NAT instance를 통해 Cognito 공개 API에 접근

### Migration과 롤백 계약

자동 롤백은 systemd 프로세스와 애플리케이션 릴리스 링크만 이전 버전으로 복구하며, 이미 적용된 PostgreSQL
migration은 역실행하지 않습니다. 따라서 모든 migration은 직전 애플리케이션 릴리스와 호환되는
expand/contract 순서를 따라야 합니다.

1. 새 column/table/index 추가처럼 이전 코드와 함께 동작하는 expand migration을 먼저 배포합니다.
2. 새 코드가 배포되고 이전 릴리스로 롤백할 필요가 없어졌는지 확인합니다.
3. column 제거나 의미 변경 같은 contract migration은 별도 후속 배포로 적용합니다.

이 계약을 지킬 수 없는 migration은 애플리케이션 자동 배포와 분리하고, 별도 백업·점검·복구 절차를 갖춘
수동 변경으로 처리합니다.

과금 런타임과 배포 기반은 별도 CDK 스택입니다. 먼저 무료에 가까운 OIDC 역할, S3 버킷, SSM 문서만
구성할 수 있습니다.

```bash
npx cdk deploy GachiSallimDeploymentStack \
  --profile gachisallim \
  --region ap-northeast-2
```

EC2, RDS, ALB, NAT instance, VPC Endpoint, Cognito, ACM, Route 53 레코드는 마지막에 런타임
스택으로 생성합니다.

```bash
npx cdk deploy GachiSallimBackendStack \
  --profile gachisallim \
  --region ap-northeast-2
```

GitHub repository variable `CD_ENABLED`는 런타임 검증이 끝날 때까지 `false`로 유지하고, 실제 자동 배포를
시작할 때만 `true`로 바꿉니다.

## 소셜 로그인

Cognito User Pool이 이메일·비밀번호와 Google, Kakao 로그인의 단일 토큰 발급자입니다. 기존
`/api/v1/auth/signup`, `/api/v1/auth/login`, `/api/v1/auth/token/refresh`, `/api/v1/auth/logout` 계약은
변경하지 않습니다.

### 배포 전 설정

환경별 Secrets Manager secret을 먼저 생성합니다.

- 운영: `gachisallim/main/social-auth`
- 개발: `gachisallim/develop/social-auth`

두 secret은 다음 JSON 필드를 가져야 합니다.

```json
{
  "googleClientId": "...",
  "googleClientSecret": "...",
  "kakaoClientId": "...",
  "kakaoClientSecret": "..."
}
```

Google OAuth redirect URI와 Kakao Redirect URI에는 CDK 출력
`ProductionCognitoIdpResponseUrl` 또는 `DevelopmentCognitoIdpResponseUrl`을 등록합니다. Kakao 앱은
OpenID Connect를 활성화하고 이메일을 필수 동의 항목으로 설정해야 합니다.

### 프론트엔드 계약

1. 환경별 `CognitoDomainUrl`의 `/oauth2/authorize`를 Authorization Code + PKCE(S256)로 엽니다.
2. `identity_provider`는 `Google`, `Kakao` 중 하나를 사용하고 `state`와 `nonce`를 검증합니다.
3. scope는 `openid email profile aws.cognito.signin.user.admin`을 요청합니다.
4. callback에서 authorization code를 Cognito `/oauth2/token`으로 교환합니다.
5. access token으로 `GET /api/v1/auth/me`를 호출합니다. 200이면 기존 사용자입니다.
6. 404이면 이름과 닉네임을 받아 `POST /api/v1/auth/social/signup`을 호출합니다.

소셜 가입 요청은 Cognito access token을 Bearer header로 전달하며 body는 다음과 같습니다.

```json
{
  "name": "홍길동",
  "nickname": "길동"
}
```

운영 callback은 `https://gachisallim.com/auth/callback`, 개발 callback은
`https://dev.gachisallim.com/auth/callback`과 `http://localhost:5173/auth/callback`입니다. 로그아웃할
때는 백엔드 `/api/v1/auth/logout` 호출 후 Cognito `/logout`으로 이동해 managed login cookie도
정리합니다.
