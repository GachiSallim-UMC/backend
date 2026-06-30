import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { HealthCheck, HealthCheckResult, HealthCheckService } from '@nestjs/terminus';

import { PrismaService } from '../prisma/prisma.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly healthCheckService: HealthCheckService,
    private readonly prismaService: PrismaService,
  ) {}

  @Get()
  @HealthCheck()
  @ApiOkResponse({ description: 'Returns service and database health status.' })
  check(): Promise<HealthCheckResult> {
    return this.healthCheckService.check([
      async () => {
        await this.prismaService.$queryRaw`SELECT 1`;

        return {
          database: {
            status: 'up',
          },
        };
      },
    ]);
  }
}
