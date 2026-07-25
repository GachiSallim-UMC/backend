import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

import {
  AUTH_PASSWORD_MAX_LENGTH,
  AUTH_PASSWORD_MIN_LENGTH,
  AUTH_PASSWORD_PATTERN,
} from '../../common/password-policy.constants';

export class ChangePasswordDto {
  @ApiProperty({
    description: '현재 사용 중인 비밀번호. 1~256자이며 공백은 사용할 수 없습니다.',
    example: 'CurrentPass1',
    maxLength: 256,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  @Matches(/^\S+$/)
  previousPassword!: string;

  @ApiProperty({
    description: `새 비밀번호. ${AUTH_PASSWORD_MIN_LENGTH}~${AUTH_PASSWORD_MAX_LENGTH}자이며 영문 소문자·대문자·숫자를 각각 1개 이상 포함해야 합니다. 공백은 사용할 수 없고 특수문자는 필수가 아니며 사용할 수 있습니다. 현재 비밀번호와 달라야 합니다.`,
    example: 'NewPassword1',
    minLength: AUTH_PASSWORD_MIN_LENGTH,
    maxLength: AUTH_PASSWORD_MAX_LENGTH,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(AUTH_PASSWORD_MAX_LENGTH)
  @Matches(AUTH_PASSWORD_PATTERN)
  newPassword!: string;
}
