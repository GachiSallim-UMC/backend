import { ApiProperty } from '@nestjs/swagger';

import { PushSubscriptionResponseDto } from './push-subscription-response.dto';

export class PushSubscriptionListResponseDto {
  @ApiProperty({ type: [PushSubscriptionResponseDto] })
  subscriptions!: PushSubscriptionResponseDto[];
}
