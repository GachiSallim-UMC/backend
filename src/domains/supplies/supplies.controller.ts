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
import {
  ApiBearerAuth,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';

import { ErrorCode } from '../../common/constants/error-code.constant';
import { BusinessException } from '../../common/exceptions/business.exception';
import { AuthContext } from '../auth/common/auth-context.interface';
import { CognitoAccessTokenGuard } from '../auth/common/cognito-access-token.guard';
import { CurrentAuth } from '../auth/common/current-auth.decorator';
import { CreateSupplyDto } from './dto/create-supply.dto';
import { ListSuppliesQueryDto } from './dto/list-supplies-query.dto';
import { PurchaseSupplyDto } from './dto/purchase-supply.dto';
import {
  PurchaseSupplyExpenseDto,
  PurchaseSupplyExpenseSplitDto,
  PurchaseSupplyLogDto,
  PurchaseSupplyResponseDto,
} from './dto/purchase-supply-response.dto';
import { ShareSupplyDto } from './dto/share-supply.dto';
import { UpdateSupplyDto } from './dto/update-supply.dto';
import { UpdateSupplyStatusDto } from './dto/update-supply-status.dto';
import { SuppliesService } from './supplies.service';

@ApiTags('공용물품 관리 (SUPPLY)')
@ApiBearerAuth('BearerAuth')
@ApiResponse({ status: 401, description: '인증 토큰이 없거나 올바르지 않습니다.' })
@ApiResponse({ status: 403, description: '그룹 멤버가 아니거나 권한이 없습니다.' })
@ApiExtraModels(
  PurchaseSupplyResponseDto,
  PurchaseSupplyExpenseDto,
  PurchaseSupplyExpenseSplitDto,
  PurchaseSupplyLogDto,
)
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

  @Patch(':supplyId')
  @ApiOperation({ summary: '물품 수정 (SUP-EDIT-01)' })
  @ApiParam({ name: 'supplyId', type: Number, example: 21 })
  updateSupply(
    @Param('supplyId') supplyId: string,
    @Body() dto: UpdateSupplyDto,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.suppliesService.updateSupply(
      this.parseId(supplyId, 'supplyId'),
      dto,
      auth.cognitoSub,
    );
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
  @ApiOperation({
    summary: '구매 완료 및 정산 연결 (SUP-BUY-01)',
    description:
      '물품을 PURCHASED로 전환하고 구매 금액으로 Expense를 생성한 뒤, 활성 그룹 구성원 전원 기준 균등 분담 내역(ExpenseSplit)까지 같은 트랜잭션에서 생성합니다. 선지불자(구매자)의 분담은 PRE_PAID, 나머지는 REQUESTED로 생성되며, 반환된 splitId로 `PATCH /api/v1/expenses/splits/{splitId}/settle`을 바로 호출할 수 있습니다.',
  })
  @ApiParam({ name: 'supplyId', type: Number, example: 21 })
  @ApiOkResponse({
    description: '구매 완료 및 정산 연결 성공',
    schema: successSchema(PurchaseSupplyResponseDto),
  })
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

/**
 * 전역 `ResponseInterceptor`가 반환값을 `{ statusCode, data, error }`로 감싸므로,
 * 실제 wire 응답과 맞추려면 Swagger 스키마도 envelope를 포함해야 한다.
 * DTO를 `type`으로 그대로 노출하면 클라이언트가 최상위에서 필드를 찾게 되어 파싱에 실패한다.
 */
function successSchema(model: typeof PurchaseSupplyResponseDto, statusCode = 200) {
  return {
    type: 'object',
    required: ['statusCode', 'data', 'error'],
    properties: {
      statusCode: { type: 'integer', example: statusCode },
      data: { $ref: getSchemaPath(model) },
      error: { type: 'object', nullable: true, example: null },
    },
  };
}
