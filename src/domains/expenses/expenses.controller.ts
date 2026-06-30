import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('expenses')
@Controller('expenses')
export class ExpensesController {}
