import { ApiProperty } from '@nestjs/swagger';

export class DeleteAuthAccountResponseDto {
  @ApiProperty({ example: 1 })
  userId!: number;

  @ApiProperty({ example: true })
  deleted!: true;
}
