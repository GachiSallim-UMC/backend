import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { AppService } from './app.service';

@ApiTags('app')
@ApiBearerAuth('BearerAuth')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOkResponse({ description: 'Returns basic application metadata.' })
  getRoot(): { name: string; version: string } {
    return this.appService.getMetadata();
  }
}
