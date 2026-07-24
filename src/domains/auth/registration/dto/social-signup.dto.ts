import { PickType } from '@nestjs/swagger';

import { SignupDto } from './signup.dto';

export class SocialSignupDto extends PickType(SignupDto, ['name', 'nickname'] as const) {}
