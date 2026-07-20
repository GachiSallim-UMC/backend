import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';

import { ErrorCode } from '../../common/constants/error-code.constant';
import { BusinessException } from '../../common/exceptions/business.exception';
import { AuthContext } from '../auth/common/auth-context.interface';
import { CognitoAccessTokenGuard } from '../auth/common/cognito-access-token.guard';
import { CurrentAuth } from '../auth/common/current-auth.decorator';
import { CreateSupplyDto } from './dto/create-supply.dto';
import { ListSuppliesQueryDto } from './dto/list-supplies-query.dto';
import { PurchaseSupplyDto } from './dto/purchase-supply.dto';
import { ShareSupplyDto } from './dto/share-supply.dto';
import { UpdateSupplyStatusDto } from './dto/update-supply-status.dto';
import { SuppliesService } from './supplies.service';

@ApiTags('공용물품 관리 (SUPPLY)')
@ApiBearerAuth('BearerAuth')
@ApiResponse({ status: 401, description: '인증 토큰이 없거나 올바르지 않습니다.' })
@ApiResponse({ status: 403, description: '그룹 멤버가 아니거나 권한이 없습니다.' })
@UseGuards(CognitoAccessTokenGuard)
@Controller('supplies')
export class SuppliesController {
  constructor(private readonly suppliesService: SuppliesService) {}

  @Get()
  @ApiOperation({ summary: '공용 물품 목록 조회' })
  listSupplies(@Query() query: ListSuppliesQueryDto, @CurrentAuth() auth: AuthContext) {
    return this.suppliesService.listSupplies(query, auth.cognitoSub);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '물품 등록 (SUP-REG-01)' })
  createSupply(@Body() dto: CreateSupplyDto, @CurrentAuth() auth: AuthContext) {
    return this.suppliesService.createSupply(dto, auth.cognitoSub);
  }

  @Patch(':supplyId/status')
  @ApiOperation({ summary: '물품 상태 변경 (SUP-STATUS-01)' })
  @ApiParam({ name: 'supplyId', type: Number, example: 21 })
  updateStatus(
    @Param('supplyId') supplyId: string,
    @Body() dto: UpdateSupplyStatusDto,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.suppliesService.updateStatus(
      this.parseId(supplyId, 'supplyId'),
      dto,
      auth.cognitoSub,
    );
  }

  @Post(':supplyId/purchase')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '구매 완료 및 정산 연결 (SUP-BUY-01)' })
  @ApiParam({ name: 'supplyId', type: Number, example: 21 })
  purchase(
    @Param('supplyId') supplyId: string,
    @Body() dto: PurchaseSupplyDto,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.suppliesService.purchase(this.parseId(supplyId, 'supplyId'), dto, auth.cognitoSub);
  }

  @Post(':supplyId/share')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '물품 메신저 공유 (SUP-SHARE-01)' })
  @ApiParam({ name: 'supplyId', type: Number, example: 21 })
  share(
    @Param('supplyId') supplyId: string,
    @Body() dto: ShareSupplyDto,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.suppliesService.share(
      this.parseId(supplyId, 'supplyId'),
      auth.cognitoSub,
      BigInt(dto.chatRoomId),
      dto.content,
    );
  }

  @Delete(':supplyId')
  @ApiOperation({ summary: '물품 삭제 (SUP-DEL-01)' })
  @ApiParam({ name: 'supplyId', type: Number, example: 21 })
  deleteSupply(@Param('supplyId') supplyId: string, @CurrentAuth() auth: AuthContext) {
    return this.suppliesService.deleteSupply(this.parseId(supplyId, 'supplyId'), auth.cognitoSub);
  }

  private parseId(value: string, field: string): bigint {
    if (!/^\d+$/.test(value)) {
      throw new BusinessException(ErrorCode.COMMON_INVALID_PARAMETER, [
        { field, value, reason: '유효한 ID 형식이 아닙니다.' },
      ]);
    }

    return BigInt(value);
  }
}
