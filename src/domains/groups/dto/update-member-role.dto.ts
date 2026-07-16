import { ApiProperty } from '@nestjs/swagger';
import { GroupRole } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateMemberRoleDto {
  @ApiProperty({ description: '변경할 역할', enum: GroupRole, example: GroupRole.ADMIN })
  @IsEnum(GroupRole)
  role!: GroupRole;
}
