import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsUrl,
  Length,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: '길동', description: '닉네임 (2~10자, 특수문자 불가)' })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @Length(2, 10)
  @Matches(/^[가-힣a-zA-Z0-9]+$/)
  nickname?: string;

  @ApiPropertyOptional({
    example: 'https://example.com/profile.png',
    description: '프로필 이미지 URL. null이면 기존 이미지를 제거합니다.',
    nullable: true,
  })
  @ValidateIf((_object, value: unknown) => value !== undefined && value !== null)
  @IsString()
  @IsUrl()
  @MaxLength(512)
  profileImage?: string | null;
}
