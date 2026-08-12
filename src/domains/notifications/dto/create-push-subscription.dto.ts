import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDefined, IsNotEmpty, IsObject, IsString, IsUrl, ValidateNested } from 'class-validator';

export class PushSubscriptionKeysDto {
  @ApiProperty({ description: '브라우저 PushSubscription p256dh 키' })
  @IsString()
  @IsNotEmpty()
  p256dh!: string;

  @ApiProperty({ description: '브라우저 PushSubscription auth 키' })
  @IsString()
  @IsNotEmpty()
  auth!: string;
}

export class CreatePushSubscriptionDto {
  @ApiProperty({ example: 'https://push.example.com/subscriptions/device-token' })
  @IsUrl({ protocols: ['https'], require_protocol: true })
  endpoint!: string;

  @ApiProperty({ type: PushSubscriptionKeysDto })
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => PushSubscriptionKeysDto)
  keys!: PushSubscriptionKeysDto;
}
