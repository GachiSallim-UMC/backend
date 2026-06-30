import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('supplies')
@Controller('supplies')
export class SuppliesController {}
