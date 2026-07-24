import { ApiProperty } from '@nestjs/swagger';

class RuleAgreementDto {
  @ApiProperty({ example: 5, description: '사용자 ID' })
  userId!: number;

  @ApiProperty({ example: '홍길동', description: '사용자 닉네임' })
  nickname!: string;

  @ApiProperty({ example: 'AGREED', description: '동의 상태' })
  status!: string;

  @ApiProperty({ example: '2026-07-03T13:30:00Z', description: '동의 확인 일시', nullable: true })
  confirmedAt!: string | null;
}

class RuleAgreementSummaryDto {
  @ApiProperty({ example: 3, description: '총 동의 요청 수' })
  totalCount!: number;

  @ApiProperty({ example: 2, description: '동의 수' })
  agreedCount!: number;

  @ApiProperty({ example: 0, description: '비동의 수' })
  disagreedCount!: number;

  @ApiProperty({ example: 1, description: '대기 수' })
  pendingCount!: number;
}

class RuleCreatorDto {
  @ApiProperty({ example: 5, description: '등록자 사용자 ID' })
  userId!: number;

  @ApiProperty({ example: '홍길동', description: '등록자 닉네임' })
  nickname!: string;
}

class RuleHistoryDto {
  @ApiProperty({ example: 31, description: '히스토리 ID' })
  logId!: number;

  @ApiProperty({ example: 'UPDATED', description: '변경 액션' })
  action!: string;

  @ApiProperty({ example: '홍길동 님이 규칙을 수정했습니다.', description: '히스토리 메시지' })
  message!: string;

  @ApiProperty({ example: '2026-07-03T15:00:00Z', description: '생성일시' })
  createdAt!: string;
}

export class RuleDetailResponseDto {
  @ApiProperty({ example: 123, description: '규칙 ID' })
  ruleId!: number;

  @ApiProperty({ example: 1, description: '그룹 ID' })
  groupId!: number;

  @ApiProperty({ example: 1, description: '카테고리 ID' })
  categoryId!: number | null;

  @ApiProperty({ example: '소음', description: '카테고리명', nullable: true })
  categoryName!: string | null;

  @ApiProperty({ example: '밤 11시 이후 조용히 하기', description: '규칙 제목' })
  title!: string;

  @ApiProperty({
    example: '늦은 시간에는 소음을 줄여주세요.',
    description: '규칙 설명',
    nullable: true,
  })
  description!: string | null;

  @ApiProperty({ example: 'ACTIVE', description: '규칙 상태' })
  status!: string;

  @ApiProperty({ type: RuleCreatorDto, description: '등록자 정보' })
  createdBy!: RuleCreatorDto;

  @ApiProperty({ example: 'AGREED', description: '요청한 사용자의 동의 상태', nullable: true })
  myAgreementStatus!: string | null;

  @ApiProperty({ type: RuleAgreementSummaryDto, description: '동의 요약 정보' })
  agreementSummary!: RuleAgreementSummaryDto;

  @ApiProperty({ type: [RuleAgreementDto], description: '동의 참여자 목록' })
  agreements!: RuleAgreementDto[];

  @ApiProperty({ type: [RuleHistoryDto], description: '변경 이력' })
  histories!: RuleHistoryDto[];

  @ApiProperty({ example: '2026-07-03T13:00:00Z', description: '생성일시' })
  createdAt!: string;

  @ApiProperty({ example: '2026-07-03T15:00:00Z', description: '수정일시' })
  updatedAt!: string;
}
