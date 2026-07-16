import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';

import { ErrorCode } from '../../common/constants/error-code.constant';
import { BusinessException } from '../../common/exceptions/business.exception';
import { CreateSupplyDto } from './dto/create-supply.dto';
import { ListSuppliesQueryDto } from './dto/list-supplies-query.dto';
import { PurchaseSupplyDto } from './dto/purchase-supply.dto';
import { ShareSupplyDto } from './dto/share-supply.dto';
import { UpdateSupplyStatusDto } from './dto/update-supply-status.dto';
import { SuppliesService } from './supplies.service';

@ApiTags('공용물품 관리 (SUPPLY)')
@Controller('supplies')
export class SuppliesController {
  constructor(private readonly suppliesService: SuppliesService) {}

  @Get()
  @ApiOperation({ summary: '공용 물품 목록 조회' })
  listSupplies(@Query() query: ListSuppliesQueryDto) {
    return this.suppliesService.listSupplies(query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '물품 등록 (SUP-REG-01)' })
  @ApiHeader({ name: 'x-user-id', required: true, description: '임시 인증 헤더: 요청자 ID (AUTH 도입 전까지)' })
  createSupply(@Body() dto: CreateSupplyDto, @Headers('x-user-id') userIdHeader?: string) {
    const createdBy = this.requireUserId(userIdHeader);

    return this.suppliesService.createSupply(dto, createdBy);
  }

  @Patch(':supplyId/status')
  @ApiOperation({ summary: '물품 상태 변경 (SUP-STATUS-01)' })
  @ApiParam({ name: 'supplyId', type: Number, example: 21 })
  @ApiHeader({ name: 'x-user-id', required: true, description: '임시 인증 헤더: 요청자 ID (AUTH 도입 전까지)' })
  updateStatus(
    @Param('supplyId') supplyId: string,
    @Body() dto: UpdateSupplyStatusDto,
    @Headers('x-user-id') userIdHeader?: string,
  ) {
    const userId = this.requireUserId(userIdHeader);

    return this.suppliesService.updateStatus(this.parseId(supplyId, 'supplyId'), dto, userId);
  }

  @Post(':supplyId/purchase')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '구매 완료 및 정산 연결 (SUP-BUY-01)' })
  @ApiParam({ name: 'supplyId', type: Number, example: 21 })
  @ApiHeader({ name: 'x-user-id', required: true, description: '임시 인증 헤더: 구매자 ID (AUTH 도입 전까지)' })
  purchase(
    @Param('supplyId') supplyId: string,
    @Body() dto: PurchaseSupplyDto,
    @Headers('x-user-id') userIdHeader?: string,
  ) {
    const userId = this.requireUserId(userIdHeader);

    return this.suppliesService.purchase(this.parseId(supplyId, 'supplyId'), dto, userId);
  }

  @Post(':supplyId/share')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '물품 메신저 공유 (SUP-SHARE-01)' })
  @ApiParam({ name: 'supplyId', type: Number, example: 21 })
  @ApiHeader({ name: 'x-user-id', required: true, description: '임시 인증 헤더: 공유(발신)자 ID (AUTH 도입 전까지)' })
  share(
    @Param('supplyId') supplyId: string,
    @Body() dto: ShareSupplyDto,
    @Headers('x-user-id') userIdHeader?: string,
  ) {
    const senderId = this.requireUserId(userIdHeader);

    return this.suppliesService.share(
      this.parseId(supplyId, 'supplyId'),
      senderId,
      BigInt(dto.chatRoomId),
      dto.content,
    );
  }

  @Delete(':supplyId')
  @ApiOperation({ summary: '물품 삭제 (SUP-DEL-01)' })
  @ApiParam({ name: 'supplyId', type: Number, example: 21 })
  @ApiHeader({ name: 'x-user-id', required: true, description: '임시 인증 헤더: 요청자 ID (AUTH 도입 전까지)' })
  deleteSupply(@Param('supplyId') supplyId: string, @Headers('x-user-id') userIdHeader?: string) {
    const requesterId = this.requireUserId(userIdHeader);

    return this.suppliesService.deleteSupply(this.parseId(supplyId, 'supplyId'), requesterId);
  }

  private parseId(value: string, field: string): bigint {
    if (!/^\d+$/.test(value)) {
      throw new BusinessException(ErrorCode.COMMON_INVALID_PARAMETER, [
        { field, value, reason: '유효한 ID 형식이 아닙니다.' },
      ]);
    }

    return BigInt(value);
  }

  private requireUserId(value?: string): bigint {
    if (!value || !/^\d+$/.test(value)) {
      throw new BusinessException(ErrorCode.AUTH_UNAUTHORIZED);
    }

    return BigInt(value);
  }
}
