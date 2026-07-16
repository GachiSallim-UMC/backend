import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ErrorCode } from '../../common/constants/error-code.constant';
import { BusinessException } from '../../common/exceptions/business.exception';

import { CreateRuleDto } from './dto/create-rule.dto';
import { ListRulesQueryDto } from './dto/list-rules-query.dto';
import { RuleAgreementResponseDto } from './dto/rule-agreement-response.dto';
import { RuleListResponseDto } from './dto/rule-list-response.dto';
import { RuleDetailResponseDto } from './dto/rule-detail-response.dto';
import { RuleResponseDto } from './dto/rule-response.dto';
import { UpdateRuleAgreementDto } from './dto/update-rule-agreement.dto';
import { UpdateRuleDto } from './dto/update-rule.dto';
import { RulesService } from './rules.service';

@ApiTags('rules')
@Controller('rules')
export class RulesController {
  constructor(private readonly rulesService: RulesService) {}

  private requireUserId(userIdHeader?: string): bigint {
    if (!userIdHeader) {
      throw new BusinessException(ErrorCode.COMMON_UNAUTHORIZED);
    }

    if (!/^\d+$/.test(userIdHeader)) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST);
    }

    const userId = BigInt(userIdHeader);

    if (userId < 1n) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST);
    }

    return userId;
  }

  private parseId(value: string): bigint {
    if (!/^\d+$/.test(value)) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST);
    }

    const id = BigInt(value);

    if (id < 1n) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST);
    }

    return id;
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '생활 규칙 목록 조회',
    description: '그룹별 생활 규칙 목록을 조회합니다.',
  })
  @ApiQuery({ name: 'groupId', required: true, type: Number, description: '공동생활 그룹 ID' })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['ACTIVE', 'INACTIVE'],
    description: '규칙 활성 상태 필터',
  })
  @ApiResponse({ status: 200, description: '생활 규칙 목록 조회 성공', type: RuleListResponseDto })
  @ApiResponse({ status: 400, description: 'DTO 검증 실패 (COMMON_INVALID_PARAMETER)' })
  @ApiResponse({ status: 401, description: '인증이 필요합니다.' })
  getRules(@Query() query: ListRulesQueryDto): Promise<RuleListResponseDto> {
    return this.rulesService.getRules(query);
  }

  @Get(':ruleId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '생활 규칙 상세 조회',
    description:
      '생활 규칙의 기본 정보, 동의 현황, 사용자의 동의 상태, 규칙 히스토리를 조회합니다.',
  })
  @ApiHeader({
    name: 'x-user-id',
    description: '요청자 사용자 ID',
    required: true,
    schema: { type: 'string', example: '1' },
  })
  @ApiParam({ name: 'ruleId', type: Number, description: '조회할 생활 규칙 ID' })
  @ApiResponse({
    status: 200,
    description: '생활 규칙 상세 조회 성공',
    type: RuleDetailResponseDto,
  })
  @ApiResponse({ status: 400, description: '요청 파라미터가 잘못되었습니다.' })
  @ApiResponse({ status: 401, description: '인증이 필요합니다.' })
  @ApiResponse({
    status: 403,
    description: 'GROUP_MEMBER_NOT_FOUND - 그룹에 속하지 않은 사용자입니다.',
  })
  @ApiResponse({ status: 404, description: '요청한 리소스를 찾을 수 없습니다.' })
  getRule(
    @Headers('x-user-id') userId: string,
    @Param('ruleId') ruleId: string,
  ): Promise<RuleDetailResponseDto> {
    const requesterId = this.requireUserId(userId);
    return this.rulesService.getRule(this.parseId(ruleId), requesterId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '생활 규칙 등록', description: '새로운 생활 규칙을 등록합니다.' })
  @ApiHeader({
    name: 'x-user-id',
    description: '요청자 사용자 ID',
    required: true,
    schema: { type: 'string', example: '1' },
  })
  @ApiBody({ type: CreateRuleDto })
  @ApiResponse({ status: 201, description: '생활 규칙 등록 성공', type: RuleResponseDto })
  @ApiResponse({
    status: 400,
    description: '잘못된 요청 (COMMON_400) 또는 DTO 검증 실패 (COMMON_INVALID_PARAMETER)',
  })
  @ApiResponse({ status: 401, description: '인증이 필요합니다.' })
  @ApiResponse({ status: 403, description: '접근 권한이 없습니다.' })
  @ApiResponse({
    status: 404,
    description: '그룹 없음 (RULE_404_GROUP) 또는 카테고리 없음 (RULE_404_CATEGORY)',
  })
  createRule(
    @Headers('x-user-id') userId: string,
    @Body() createRuleDto: CreateRuleDto,
  ): Promise<RuleResponseDto> {
    const createdBy = this.requireUserId(userId);
    return this.rulesService.createRule(createRuleDto, createdBy);
  }

  @Put(':ruleId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '생활 규칙 수정', description: '기존 생활 규칙의 정보를 수정합니다.' })
  @ApiHeader({
    name: 'x-user-id',
    description: '요청자 사용자 ID',
    required: true,
    schema: { type: 'string', example: '1' },
  })
  @ApiParam({ name: 'ruleId', type: Number, description: '수정할 생활 규칙 ID' })
  @ApiBody({ type: UpdateRuleDto })
  @ApiResponse({ status: 200, description: '생활 규칙 수정 성공', type: RuleResponseDto })
  @ApiResponse({
    status: 400,
    description: '잘못된 요청 (COMMON_400) 또는 DTO 검증 실패 (COMMON_INVALID_PARAMETER)',
  })
  @ApiResponse({ status: 401, description: '인증이 필요합니다.' })
  @ApiResponse({ status: 403, description: '접근 권한이 없습니다.' })
  @ApiResponse({
    status: 404,
    description: '규칙 없음 (COMMON_404) 또는 카테고리 없음 (RULE_404_CATEGORY)',
  })
  updateRule(
    @Headers('x-user-id') userId: string,
    @Param('ruleId') ruleId: string,
    @Body() updateRuleDto: UpdateRuleDto,
  ): Promise<RuleResponseDto> {
    const requesterId = this.requireUserId(userId);
    return this.rulesService.updateRule(this.parseId(ruleId), updateRuleDto, requesterId);
  }

  @Put(':ruleId/agreements')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '생활 규칙 확인 및 동의',
    description: '생활 규칙에 대한 사용자의 동의 상태를 저장합니다.',
  })
  @ApiHeader({
    name: 'x-user-id',
    description: '요청자 사용자 ID',
    required: true,
    schema: { type: 'string', example: '5' },
  })
  @ApiParam({ name: 'ruleId', type: Number, description: '동의 상태를 변경할 생활 규칙 ID' })
  @ApiBody({ type: UpdateRuleAgreementDto })
  @ApiResponse({
    status: 200,
    description: '생활 규칙 동의 상태 변경 성공',
    type: RuleAgreementResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: '잘못된 요청 (COMMON_400) 또는 DTO 검증 실패 (COMMON_INVALID_PARAMETER)',
  })
  @ApiResponse({ status: 401, description: '인증이 필요합니다. (COMMON_401)' })
  @ApiResponse({ status: 403, description: '그룹 구성원이 아님 (GROUP_MEMBER_NOT_FOUND)' })
  @ApiResponse({ status: 404, description: '규칙 없음 (COMMON_404)' })
  updateRuleAgreement(
    @Headers('x-user-id') userId: string,
    @Param('ruleId') ruleId: string,
    @Body() updateRuleAgreementDto: UpdateRuleAgreementDto,
  ): Promise<RuleAgreementResponseDto> {
    const requesterId = this.requireUserId(userId);
    return this.rulesService.updateRuleAgreement(
      this.parseId(ruleId),
      updateRuleAgreementDto,
      requesterId,
    );
  }

  @Delete(':ruleId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '생활 규칙 삭제', description: '생활 규칙을 삭제합니다.' })
  @ApiHeader({
    name: 'x-user-id',
    description: '요청자 사용자 ID',
    required: true,
    schema: { type: 'string', example: '1' },
  })
  @ApiParam({ name: 'ruleId', type: Number, description: '삭제할 생활 규칙 ID' })
  @ApiResponse({ status: 200, description: '생활 규칙 삭제 성공', type: RuleResponseDto })
  @ApiResponse({ status: 400, description: '잘못된 규칙 ID (COMMON_400)' })
  @ApiResponse({ status: 401, description: '인증이 필요합니다.' })
  @ApiResponse({ status: 403, description: '접근 권한이 없습니다.' })
  @ApiResponse({ status: 404, description: '규칙 없음 (COMMON_404)' })
  deleteRule(
    @Headers('x-user-id') userId: string,
    @Param('ruleId') ruleId: string,
  ): Promise<RuleResponseDto> {
    const requesterId = this.requireUserId(userId);
    return this.rulesService.deleteRule(this.parseId(ruleId), requesterId);
  }
}
