import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateGroupPermissionDto {
  @ApiProperty({ description: '멤버의 집안일 등록 허용', example: true, required: false })
  @IsOptional()
  @IsBoolean()
  allowChoreRegistration?: boolean;

  @ApiProperty({ description: '멤버의 정산 등록 허용', example: true, required: false })
  @IsOptional()
  @IsBoolean()
  allowSettlementRegistration?: boolean;

  @ApiProperty({ description: '멤버의 공용 물품 상태 변경 허용', example: true, required: false })
  @IsOptional()
  @IsBoolean()
  allowItemStatusChange?: boolean;

  @ApiProperty({ description: '신규 멤버 자동 승인(관리자 승인 생략)', example: false, required: false })
  @IsOptional()
  @IsBoolean()
  autoApproveNewMembers?: boolean;
}
