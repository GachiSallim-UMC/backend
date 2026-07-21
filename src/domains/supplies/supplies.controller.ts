import { Controller } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

@ApiTags('supplies')
@ApiBearerAuth('BearerAuth')
@Controller('supplies')
export class SuppliesController {}
