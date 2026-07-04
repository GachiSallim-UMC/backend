import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';

import { CreateRuleDto } from './dto/create-rule.dto';
import { ListRulesQueryDto } from './dto/list-rules-query.dto';
import { RuleListResponseDto } from './dto/rule-list-response.dto';
import { RuleResponseDto } from './dto/rule-response.dto';
import { UpdateRuleDto } from './dto/update-rule.dto';
import { RulesService } from './rules.service';

@ApiTags('rules')
@Controller('api/v1/rules')
export class RulesController {
  constructor(private readonly rulesService: RulesService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '생활 규칙 목록 조회', description: '그룹별 생활 규칙 목록을 조회합니다.' })
  @ApiQuery({ name: 'groupId', required: true, type: Number, description: '공동생활 그룹 ID' })
  @ApiQuery({ name: 'status', required: false, enum: ['ACTIVE', 'INACTIVE'], description: '규칙 활성 상태 필터' })
  @ApiResponse({ status: 200, description: '생활 규칙 목록 조회 성공', type: RuleListResponseDto })
  @ApiResponse({ status: 400, description: '요청 파라미터가 잘못되었습니다.' })
  @ApiResponse({ status: 401, description: '인증이 필요합니다.' })
  getRules(@Query() query: ListRulesQueryDto): Promise<RuleListResponseDto> {
    return this.rulesService.getRules(query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '생활 규칙 등록', description: '새로운 생활 규칙을 등록합니다.' })
  @ApiBody({ type: CreateRuleDto })
  @ApiResponse({ status: 201, description: '생활 규칙 등록 성공', type: RuleResponseDto })
  @ApiResponse({ status: 400, description: '요청 파라미터가 잘못되었습니다.' })
  @ApiResponse({ status: 401, description: '인증이 필요합니다.' })
  @ApiResponse({ status: 403, description: '접근 권한이 없습니다.' })
  @ApiResponse({ status: 404, description: '요청한 리소스를 찾을 수 없습니다.' })
  createRule(@Body() createRuleDto: CreateRuleDto): Promise<RuleResponseDto> {
    return this.rulesService.createRule(createRuleDto);
  }

  @Put(':ruleId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '생활 규칙 수정', description: '기존 생활 규칙의 정보를 수정합니다.' })
  @ApiParam({ name: 'ruleId', type: Number, description: '수정할 생활 규칙 ID' })
  @ApiBody({ type: UpdateRuleDto })
  @ApiResponse({ status: 200, description: '생활 규칙 수정 성공', type: RuleResponseDto })
  @ApiResponse({ status: 400, description: '요청 파라미터가 잘못되었습니다.' })
  @ApiResponse({ status: 401, description: '인증이 필요합니다.' })
  @ApiResponse({ status: 403, description: '접근 권한이 없습니다.' })
  @ApiResponse({ status: 404, description: '요청한 리소스를 찾을 수 없습니다.' })
  updateRule(@Param('ruleId') ruleId: string, @Body() updateRuleDto: UpdateRuleDto): Promise<RuleResponseDto> {
    return this.rulesService.updateRule(Number(ruleId), updateRuleDto);
  }

  @Delete(':ruleId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '생활 규칙 삭제', description: '생활 규칙을 삭제합니다.' })
  @ApiParam({ name: 'ruleId', type: Number, description: '삭제할 생활 규칙 ID' })
  @ApiResponse({ status: 200, description: '생활 규칙 삭제 성공', type: RuleResponseDto })
  @ApiResponse({ status: 400, description: '요청 파라미터가 잘못되었습니다.' })
  @ApiResponse({ status: 401, description: '인증이 필요합니다.' })
  @ApiResponse({ status: 403, description: '접근 권한이 없습니다.' })
  @ApiResponse({ status: 404, description: '요청한 리소스를 찾을 수 없습니다.' })
  deleteRule(@Param('ruleId') ruleId: string): Promise<RuleResponseDto> {
    return this.rulesService.deleteRule(Number(ruleId), 1n);
  }
}
