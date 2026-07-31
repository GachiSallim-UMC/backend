import { ApiProperty } from '@nestjs/swagger';

export class InviteInfoResponseDto {
  @ApiProperty({ description: '그룹 이름', example: '자취방 메이트' })
  name!: string;

  @ApiProperty({ description: '그룹 설명', example: '2인 자취 공유 그룹', nullable: true })
  description!: string | null;

  @ApiProperty({ description: '현재 인원', example: 3 })
  currentMembers!: number;

  @ApiProperty({ description: '최대 인원', example: 4 })
  maxMembers!: number;
}
