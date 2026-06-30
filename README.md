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
