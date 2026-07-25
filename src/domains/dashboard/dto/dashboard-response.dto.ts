import { ApiProperty } from '@nestjs/swagger';

export class DashboardSummaryDto {
  @ApiProperty({ example: 3, description: '오늘 예정된 집안일 전체 건수' })
  todayChoreCount!: number;

  @ApiProperty({ example: 2, description: '오늘 예정된 집안일 중 미완료 건수' })
  unfinishedChoreCount!: number;

  @ApiProperty({ example: 42000, description: '미정산 총금액' })
  unsettledAmount!: number;

  @ApiProperty({ example: 3, description: '미정산 건수' })
  unsettledExpenseCount!: number;

  @ApiProperty({ example: 2, description: '부족 또는 소진 상태인 공용 물품 건수' })
  lowSupplyCount!: number;

  @ApiProperty({ example: 5, description: '안 읽은 메시지 건수' })
  unreadMessageCount!: number;
}

export class TodayChoreDto {
  @ApiProperty({ example: 11, description: '집안일 ID' })
  choreId!: number;

  @ApiProperty({ example: '화장실 청소', description: '집안일 제목' })
  title!: string;

  @ApiProperty({ example: '홍길동', description: '담당자 닉네임' })
  assigneeName!: string;

  @ApiProperty({ example: '매주', description: '반복 주기 표시 문구' })
  repeatText!: string;

  @ApiProperty({ enum: ['PENDING', 'DONE'], example: 'DONE', description: '집안일 상태' })
  status!: 'PENDING' | 'DONE';
}

export class UnsettledExpenseDto {
  @ApiProperty({ example: 21, description: '생활비 ID' })
  expenseId!: number;

  @ApiProperty({ example: '마트 장보기', description: '생활비 제목' })
  title!: string;

  @ApiProperty({ example: '김영희', description: '선지불자 닉네임' })
  payerName!: string;

  @ApiProperty({ example: 660, description: '1인당 정산 금액' })
  amountPerPerson!: number;

  @ApiProperty({ enum: ['UNSETTLED', 'SETTLED'], example: 'UNSETTLED', description: '정산 상태' })
  status!: 'UNSETTLED' | 'SETTLED';
}

export class LowSupplyDto {
  @ApiProperty({ example: 31, description: '공용 물품 ID' })
  supplyId!: number;

  @ApiProperty({ example: '세제', description: '공용 물품명' })
  name!: string;

  @ApiProperty({ enum: ['LOW', 'EMPTY'], example: 'LOW', description: '공용 물품 상태' })
  status!: 'LOW' | 'EMPTY';

  @ApiProperty({ example: '이철수', description: '구매 담당자 닉네임', nullable: true })
  assigneeName!: string | null;
}

export class RecentActivityDto {
  @ApiProperty({ example: 41, description: '활동 ID' })
  activityId!: number;

  @ApiProperty({ example: '김영희', description: '활동 사용자 닉네임' })
  actorName!: string;

  @ApiProperty({
    example: 'https://example.com/profile.png',
    description: '활동 사용자 프로필 이미지',
    nullable: true,
  })
  actorProfileImage!: string | null;

  @ApiProperty({ example: '김영희 님이 생활비를 등록했습니다.', description: '활동 메시지' })
  message!: string;

  @ApiProperty({
    example: '마트 장보기 32,000원',
    description: '활동 상세 문구',
  })
  detail!: string;

  @ApiProperty({
    example: '2026-07-25T12:00:00.000Z',
    description: '활동 발생 시각(UTC ISO 8601, 화면에서 대한민국 시간 기준으로 표시)',
  })
  createdAt!: string;
}

export class DashboardResponseDto {
  @ApiProperty({ type: DashboardSummaryDto, description: '상단 요약 카드 정보' })
  summary!: DashboardSummaryDto;

  @ApiProperty({ type: [TodayChoreDto], description: '오늘 집안일 목록(최대 5건)' })
  todayChores!: TodayChoreDto[];

  @ApiProperty({ type: [UnsettledExpenseDto], description: '최근 미정산 항목 목록(최대 2건)' })
  unsettledExpenses!: UnsettledExpenseDto[];

  @ApiProperty({ type: [LowSupplyDto], description: '부족 또는 소진 공용 물품 목록(최대 5건)' })
  lowSupplies!: LowSupplyDto[];

  @ApiProperty({ type: [RecentActivityDto], description: '최근 그룹 활동 목록(최대 5건)' })
  recentActivities!: RecentActivityDto[];
}

