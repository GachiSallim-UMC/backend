import { ApiProperty } from '@nestjs/swagger';

export class DashboardSummaryDto {
  @ApiProperty({ example: 3, description: 'Number of chores scheduled for today' })
  todayChoreCount!: number;

  @ApiProperty({ example: 2, description: 'Number of unfinished chores' })
  unfinishedChoreCount!: number;

  @ApiProperty({ example: 42000, description: 'Total unsettled amount' })
  unsettledAmount!: number;

  @ApiProperty({ example: 3, description: 'Count of unsettled expenses' })
  unsettledExpenseCount!: number;

  @ApiProperty({ example: 2, description: 'Count of low/empty supplies' })
  lowSupplyCount!: number;

  @ApiProperty({ example: 5, description: 'Unread message count' })
  unreadMessageCount!: number;
}

export class TodayChoreDto {
  @ApiProperty({ example: 11, description: 'Chore ID' })
  choreId!: number;

  @ApiProperty({ example: 'Clean the living room', description: 'Chore title' })
  title!: string;

  @ApiProperty({ example: 'Alex', description: 'Assignee nickname' })
  assigneeName!: string;

  @ApiProperty({ example: 'Weekly repeat', description: 'Repeat label text' })
  repeatText!: string;

  @ApiProperty({ example: 'DONE', description: 'Chore status' })
  status!: string;
}

export class UnsettledExpenseDto {
  @ApiProperty({ example: 21, description: 'Expense ID' })
  expenseId!: number;

  @ApiProperty({ example: 'Team dinner', description: 'Expense title' })
  title!: string;

  @ApiProperty({ example: 'Chris', description: 'Payer nickname' })
  payerName!: string;

  @ApiProperty({ example: 10666, description: 'Amount per person' })
  amountPerPerson!: number;

  @ApiProperty({ example: 'UNSETTLED', description: 'Expense settlement status' })
  status!: 'UNSETTLED' | 'SETTLED';
}

export class LowSupplyDto {
  @ApiProperty({ example: 31, description: 'Supply ID' })
  supplyId!: number;

  @ApiProperty({ example: 'Toilet paper', description: 'Supply name' })
  name!: string;

  @ApiProperty({ example: 'LOW', description: 'Supply status' })
  status!: string;

  @ApiProperty({ example: 'Alex', description: 'Assignee nickname', nullable: true })
  assigneeName!: string | null;
}

export class RecentActivityDto {
  @ApiProperty({ example: 41, description: 'Activity ID' })
  activityId!: number;

  @ApiProperty({ example: 'Alex added a new chore', description: 'Activity message' })
  message!: string;

  @ApiProperty({
    example: 'Team dinner of 32,000 won has been requested.',
    description: 'Activity detail',
  })
  detail!: string;

  @ApiProperty({ example: '2026-07-03T13:00:00.000Z', description: 'Created time' })
  createdAt!: string;
}

export class DashboardResponseDto {
  @ApiProperty({ type: DashboardSummaryDto })
  summary!: DashboardSummaryDto;

  @ApiProperty({ type: [TodayChoreDto] })
  todayChores!: TodayChoreDto[];

  @ApiProperty({ type: [UnsettledExpenseDto] })
  unsettledExpenses!: UnsettledExpenseDto[];

  @ApiProperty({ type: [LowSupplyDto] })
  lowSupplies!: LowSupplyDto[];

  @ApiProperty({ type: [RecentActivityDto] })
  recentActivities!: RecentActivityDto[];
}

