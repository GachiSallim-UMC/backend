import { NotFoundException } from '@nestjs/common';

export class ExpenseNotFoundException extends NotFoundException {
  constructor() {
    super({
      message: '존재하지 않는 정산 내역입니다.',
      errorCode: 'EXPENSE_NOT_FOUND',
    });
  }
}