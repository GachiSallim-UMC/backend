import { Controller } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

@ApiTags('activities')
@ApiBearerAuth('BearerAuth')
@Controller('activities')
export class ActivitiesController {}
