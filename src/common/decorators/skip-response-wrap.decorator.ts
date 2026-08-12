import { SetMetadata } from '@nestjs/common';

export const SKIP_RESPONSE_WRAP = 'skipResponseWrap';

export const SkipResponseWrap = (): MethodDecorator & ClassDecorator => SetMetadata(SKIP_RESPONSE_WRAP, true);
