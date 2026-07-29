import { ApiProperty } from '@nestjs/swagger';

export class GroupPermissionResponseDto {
  @ApiProperty({ description: '그룹 ID', example: 1, type: Number })
  groupId!: bigint;

  @ApiProperty({ description: '멤버의 집안일 등록 허용', example: true })
  allowChoreRegistration!: boolean;

  @ApiProperty({ description: '멤버의 정산 등록 허용', example: true })
  allowSettlementRegistration!: boolean;

  @ApiProperty({ description: '멤버의 공용 물품 상태 변경 허용', example: true })
  allowItemStatusChange!: boolean;

  @ApiProperty({ description: '신규 멤버 자동 승인(관리자 승인 생략)', example: false })
  autoApproveNewMembers!: boolean;

  @ApiProperty({ description: '수정 일시', example: '2026-07-01T11:00:00Z' })
  updatedAt!: Date;
}
