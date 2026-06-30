import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('chores')
@Controller('chores')
export class ChoresController {}
