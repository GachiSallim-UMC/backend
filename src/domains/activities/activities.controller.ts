import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('activities')
@Controller('activities')
export class ActivitiesController {}
