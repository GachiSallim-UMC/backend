import { ApiProperty } from '@nestjs/swagger';

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

  @ApiProperty({ example: 'a', description: '등록자 닉네임' })
  nickname!: string;
}

export class RuleListItemDto {
  @ApiProperty({ example: 123, description: '규칙 ID' })
  ruleId!: number;

  @ApiProperty({ example: 1, description: '그룹 ID' })
  groupId!: number;

  @ApiProperty({ example: 1, description: '카테고리 ID' })
  categoryId!: number | null;

  @ApiProperty({ example: '밤 11시 이후 조용히 하기', description: '규칙 제목' })
  title!: string;

  @ApiProperty({ example: '늦은 시간에는 소음을 줄여주세요.', description: '규칙 설명' })
  description!: string | null;

  @ApiProperty({ example: 'ACTIVE', description: '규칙 상태' })
  status!: string;

  @ApiProperty({ type: RuleCreatorDto, description: '등록자 정보' })
  createdBy!: RuleCreatorDto;

  @ApiProperty({ type: RuleAgreementSummaryDto, description: '동의 요약 정보' })
  agreementSummary!: RuleAgreementSummaryDto;

  @ApiProperty({ example: '2026-07-03T13:00:00Z', description: '생성일시' })
  createdAt!: string;

  @ApiProperty({ example: '2026-07-03T13:00:00Z', description: '수정일시' })
  updatedAt!: string;
}

export class RuleListResponseDto {
  @ApiProperty({ type: [RuleListItemDto], description: '규칙 목록' })
  rules!: RuleListItemDto[];
}
