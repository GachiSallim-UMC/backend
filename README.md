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

과금 런타임과 배포 기반은 별도 CDK 스택입니다. 먼저 무료에 가까운 OIDC 역할, S3 버킷, SSM 문서만
구성할 수 있습니다.

```bash
npx cdk deploy GachiSallimDeploymentStack \
  --profile gachisallim \
  --region ap-northeast-2
```

EC2, RDS, ALB, VPC Endpoint, Cognito, ACM, Route 53 레코드는 마지막에 런타임 스택으로 생성합니다.

```bash
npx cdk deploy GachiSallimBackendStack \
  --profile gachisallim \
  --region ap-northeast-2
```

GitHub repository variable `CD_ENABLED`는 런타임 검증이 끝날 때까지 `false`로 유지하고, 실제 자동 배포를
시작할 때만 `true`로 바꿉니다.
