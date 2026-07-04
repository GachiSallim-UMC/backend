import { Controller, Get, Post, Put, Delete, Body, Param, Query, ParseIntPipe, ParseBoolPipe, Patch } from '@nestjs/common';
import { ExpensesService } from './expenses.service';
import { CreateExpenseDto } from './create-expense.dto';

@Controller('api/v1/expenses')
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Post()
  async createExpense(@Body() createExpenseDto: CreateExpenseDto) {
    return this.expensesService.createExpense(createExpenseDto);
  }

  @Get()
  async getExpensesByGroup(
    @Query('groupId', ParseIntPipe) groupId: number,
    @Query('categoryId') categoryId?: number,
    @Query('userId') userId?: number,
  ) {
    return this.expensesService.getExpensesByGroup(groupId, categoryId, userId);
  }

  @Get(':id')
  async getExpenseDetail(@Param('id', ParseIntPipe) id: number) {
    return this.expensesService.getExpenseDetail(id);
  }

  @Patch(':id')
  async updateExpense(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateExpenseDto: CreateExpenseDto,
  ) {
    return this.expensesService.updateExpense(id, updateExpenseDto);
  }

  @Delete(':id')
  async deleteExpense(@Param('id', ParseIntPipe) id: number) {
    return this.expensesService.deleteExpense(id);
  }

  @Put('splits/:id/settle')
  async settleSplit(
    @Param('id', ParseIntPipe) id: number,
    @Query('isBulkComplete', ParseBoolPipe) isBulkComplete: boolean,
  ) {
    return this.expensesService.settleSplit(id, isBulkComplete);
  }
}