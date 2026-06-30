# AGENTS.md

## Project Standards

This repository is a NestJS backend using npm, Prisma, PostgreSQL, ESLint, Prettier, and AWS CDK with TypeScript.

## Commands

- Install dependencies with `npm install`.
- Run local development with `npm run start:dev`.
- Validate changes with `npm run lint`, `npm run build`, and `npm test`.
- Generate Prisma Client with `npm run prisma:generate`.
- Use `npm run prisma:migrate:dev` only for local migration creation.
- Use `npm run prisma:migrate:deploy` for deployment environments.
- Validate infrastructure with `npm run cdk:synth`.

## Branching

- Default branch is `main`.
- Integration branch is `develop`.
- Feature branches must use `type/#issue-number/feature-name`.
- Valid examples: `feat/#12/add-websocket-gateway`, `fix/#34/prisma-validation`.

## NestJS Rules

- Keep domain code inside Nest modules.
- Prefer module/service/controller boundaries over large shared utility files.
- Use `ConfigService` for environment variables. Do not read `process.env` directly outside config validation.
- Use DTO classes with `class-validator` decorators for request validation.
- Global `ValidationPipe` is configured in `main.ts`; do not bypass it.
- Use `PrismaService` from `PrismaModule` instead of constructing Prisma clients directly.
- Keep Swagger decorators on public HTTP DTOs/controllers when adding new endpoints.
- Keep health checks under `/health`.
- WebSocket gateways should live in dedicated modules and use the existing Socket.IO setup. Add authentication, rooms, and broadcast policies only when the related product requirement exists.

## Naming Rules

- Variables and functions must be `camelCase`.
- Classes, DTOs, modules, services, controllers, interfaces, and types must be `PascalCase`.
- Constants that represent fixed values should be `UPPER_CASE`.
- Enum members must be `UPPER_CASE`.
- DTO, Prisma, or external schema property exceptions must stay narrow and be explained in code review.

## Prisma Rules

- Keep Prisma schema changes in `prisma/schema.prisma`.
- Always create migrations for database schema changes.
- Do not edit generated Prisma Client files.
- Do not hard-code database URLs or credentials.

## AWS CDK Rules

- Keep CDK code under `infra/`.
- Keep stack definitions small and split reusable infrastructure into constructs when complexity grows.
- Avoid environment lookups inside deep constructs. Pass account, region, and environment-specific values from the app or stack boundary.
- Run `npm run cdk:synth` after infrastructure changes.

## GitHub Workflow

- Use the issue templates for bugs and features.
- PRs should link issues, summarize behavior changes, and include validation results.
- Do not mark work complete until lint, build, tests, Prisma generate, and CDK synth pass or failures are explicitly documented.
