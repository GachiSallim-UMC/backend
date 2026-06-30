import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('rules')
@Controller('rules')
export class RulesController {}
