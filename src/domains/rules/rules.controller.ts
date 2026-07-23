import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ErrorCode } from '../../common/constants/error-code.constant';
import { BusinessException } from '../../common/exceptions/business.exception';
import { AuthContext } from '../auth/common/auth-context.interface';
import { CognitoAccessTokenGuard } from '../auth/common/cognito-access-token.guard';
import { CurrentAuth } from '../auth/common/current-auth.decorator';

import { CreateRuleDto } from './dto/create-rule.dto';
import { ListRulesQueryDto } from './dto/list-rules-query.dto';
import { RuleAgreementResponseDto } from './dto/rule-agreement-response.dto';
import { RuleListResponseDto } from './dto/rule-list-response.dto';
import { RuleDetailResponseDto } from './dto/rule-detail-response.dto';
import { RuleResponseDto } from './dto/rule-response.dto';
import { ShareRuleResponseDto } from './dto/share-rule-response.dto';
import { UpdateRuleAgreementDto } from './dto/update-rule-agreement.dto';
import { UpdateRuleDto } from './dto/update-rule.dto';
import { RulesAuthenticatedUserService } from './rules-authenticated-user.service';
import { RulesService } from './rules.service';

@ApiTags('rules')
@ApiBearerAuth('BearerAuth')
@UseGuards(CognitoAccessTokenGuard)
@Controller('rules')
export class RulesController {
  constructor(
    private readonly rulesService: RulesService,
    private readonly authenticatedUsers: RulesAuthenticatedUserService,
  ) {}

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
    summary: '?앺솢 洹쒖튃 紐⑸줉 議고쉶',
    description: '洹몃９蹂??앺솢 洹쒖튃 紐⑸줉??議고쉶?⑸땲??',
  })
  @ApiQuery({ name: 'groupId', required: true, type: Number, description: '怨듬룞?앺솢 洹몃９ ID' })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['ACTIVE', 'INACTIVE'],
    description: '洹쒖튃 ?쒖꽦 ?곹깭 ?꾪꽣',
  })
  @ApiResponse({ status: 200, description: '?앺솢 洹쒖튃 紐⑸줉 議고쉶 ?깃났', type: RuleListResponseDto })
  @ApiResponse({ status: 400, description: 'DTO 寃利??ㅽ뙣 (COMMON_INVALID_PARAMETER)' })
  @ApiResponse({ status: 401, description: '?몄쬆???꾩슂?⑸땲??' })
  async getRules(
    @CurrentAuth() auth: AuthContext,
    @Query() query: ListRulesQueryDto,
  ): Promise<RuleListResponseDto> {
    await this.authenticatedUsers.resolveActiveUserId(auth.cognitoSub);
    return this.rulesService.getRules(query);
  }

  @Get(':ruleId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '?앺솢 洹쒖튃 ?곸꽭 議고쉶',
    description:
      '?앺솢 洹쒖튃??湲곕낯 ?뺣낫, ?숈쓽 ?꾪솴, ?ъ슜?먯쓽 ?숈쓽 ?곹깭, 洹쒖튃 ?덉뒪?좊━瑜?議고쉶?⑸땲??',
  })
  @ApiParam({ name: 'ruleId', type: Number, description: '議고쉶???앺솢 洹쒖튃 ID' })
  @ApiResponse({
    status: 200,
    description: '?앺솢 洹쒖튃 ?곸꽭 議고쉶 ?깃났',
    type: RuleDetailResponseDto,
  })
  @ApiResponse({ status: 400, description: '?붿껌 ?뚮씪誘명꽣媛 ?섎せ?섏뿀?듬땲??' })
  @ApiResponse({ status: 401, description: '?몄쬆???꾩슂?⑸땲??' })
  @ApiResponse({
    status: 403,
    description: 'GROUP_MEMBER_NOT_FOUND - 洹몃９???랁븯吏 ?딆? ?ъ슜?먯엯?덈떎.',
  })
  @ApiResponse({ status: 404, description: '?붿껌??由ъ냼?ㅻ? 李얠쓣 ???놁뒿?덈떎.' })
  async getRule(
    @CurrentAuth() auth: AuthContext,
    @Param('ruleId') ruleId: string,
  ): Promise<RuleDetailResponseDto> {
    const requesterId = await this.authenticatedUsers.resolveActiveUserId(auth.cognitoSub);
    return this.rulesService.getRule(this.parseId(ruleId), requesterId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '?앺솢 洹쒖튃 ?깅줉', description: '?덈줈???앺솢 洹쒖튃???깅줉?⑸땲??' })
  @ApiBody({ type: CreateRuleDto })
  @ApiResponse({ status: 201, description: '?앺솢 洹쒖튃 ?깅줉 ?깃났', type: RuleResponseDto })
  @ApiResponse({
    status: 400,
    description: '?섎せ???붿껌 (COMMON_400) ?먮뒗 DTO 寃利??ㅽ뙣 (COMMON_INVALID_PARAMETER)',
  })
  @ApiResponse({ status: 401, description: '?몄쬆???꾩슂?⑸땲??' })
  @ApiResponse({ status: 403, description: '?묎렐 沅뚰븳???놁뒿?덈떎.' })
  @ApiResponse({
    status: 404,
    description: '洹몃９ ?놁쓬 (RULE_404_GROUP) ?먮뒗 移댄뀒怨좊━ ?놁쓬 (RULE_404_CATEGORY)',
  })
  async createRule(
    @CurrentAuth() auth: AuthContext,
    @Body() createRuleDto: CreateRuleDto,
  ): Promise<RuleResponseDto> {
    const createdBy = await this.authenticatedUsers.resolveActiveUserId(auth.cognitoSub);
    return this.rulesService.createRule(createRuleDto, createdBy);
  }

  @Put(':ruleId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '?앺솢 洹쒖튃 ?섏젙', description: '湲곗〈 ?앺솢 洹쒖튃???뺣낫瑜??섏젙?⑸땲??' })
  @ApiParam({ name: 'ruleId', type: Number, description: '?섏젙???앺솢 洹쒖튃 ID' })
  @ApiBody({ type: UpdateRuleDto })
  @ApiResponse({ status: 200, description: '?앺솢 洹쒖튃 ?섏젙 ?깃났', type: RuleResponseDto })
  @ApiResponse({
    status: 400,
    description: '?섎せ???붿껌 (COMMON_400) ?먮뒗 DTO 寃利??ㅽ뙣 (COMMON_INVALID_PARAMETER)',
  })
  @ApiResponse({ status: 401, description: '?몄쬆???꾩슂?⑸땲??' })
  @ApiResponse({ status: 403, description: '?묎렐 沅뚰븳???놁뒿?덈떎.' })
  @ApiResponse({
    status: 404,
    description: '洹쒖튃 ?놁쓬 (COMMON_404) ?먮뒗 移댄뀒怨좊━ ?놁쓬 (RULE_404_CATEGORY)',
  })
  async updateRule(
    @CurrentAuth() auth: AuthContext,
    @Param('ruleId') ruleId: string,
    @Body() updateRuleDto: UpdateRuleDto,
  ): Promise<RuleResponseDto> {
    const requesterId = await this.authenticatedUsers.resolveActiveUserId(auth.cognitoSub);
    return this.rulesService.updateRule(this.parseId(ruleId), updateRuleDto, requesterId);
  }

  @Put(':ruleId/agreements')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '?앺솢 洹쒖튃 ?뺤씤 諛??숈쓽',
    description: '?앺솢 洹쒖튃??????ъ슜?먯쓽 ?숈쓽 ?곹깭瑜???ν빀?덈떎.',
  })
  @ApiParam({ name: 'ruleId', type: Number, description: '?숈쓽 ?곹깭瑜?蹂寃쏀븷 ?앺솢 洹쒖튃 ID' })
  @ApiBody({ type: UpdateRuleAgreementDto })
  @ApiResponse({
    status: 200,
    description: '?앺솢 洹쒖튃 ?숈쓽 ?곹깭 蹂寃??깃났',
    type: RuleAgreementResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: '?섎せ???붿껌 (COMMON_400) ?먮뒗 DTO 寃利??ㅽ뙣 (COMMON_INVALID_PARAMETER)',
  })
  @ApiResponse({ status: 401, description: '?몄쬆???꾩슂?⑸땲?? (COMMON_401)' })
  @ApiResponse({ status: 403, description: '洹몃９ 援ъ꽦?먯씠 ?꾨떂 (GROUP_MEMBER_NOT_FOUND)' })
  @ApiResponse({ status: 404, description: '洹쒖튃 ?놁쓬 (COMMON_404)' })
  async updateRuleAgreement(
    @CurrentAuth() auth: AuthContext,
    @Param('ruleId') ruleId: string,
    @Body() updateRuleAgreementDto: UpdateRuleAgreementDto,
  ): Promise<RuleAgreementResponseDto> {
    const requesterId = await this.authenticatedUsers.resolveActiveUserId(auth.cognitoSub);
    return this.rulesService.updateRuleAgreement(
      this.parseId(ruleId),
      updateRuleAgreementDto,
      requesterId,
    );
  }

  @Post(':ruleId/share')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '?앺솢 洹쒖튃 硫붿떊? 怨듭쑀 (RULE-SHARE-01)',
    description:
      '?앺솢 洹쒖튃??怨듭쑀 移대뱶 硫붿떆吏濡?蹂?섑빐 洹쒖튃 洹몃９??湲곕낯 梨꾪똿諛⑹뿉 ?꾩넚?⑸땲??',
  })
  @ApiParam({ name: 'ruleId', type: Number, description: '怨듭쑀???앺솢 洹쒖튃 ID' })
  @ApiResponse({ status: 200, description: '?앺솢 洹쒖튃 硫붿떊? 怨듭쑀 ?깃났', type: ShareRuleResponseDto })
  @ApiResponse({ status: 400, description: '?붿껌 ?뚮씪誘명꽣媛 ?섎せ?섏뿀?듬땲??' })
  @ApiResponse({ status: 401, description: '?몄쬆???꾩슂?⑸땲??' })
  @ApiResponse({ status: 404, description: '洹쒖튃, 湲곕낯 梨꾪똿諛??먮뒗 梨꾪똿諛?硫ㅻ쾭瑜?李얠쓣 ???놁뒿?덈떎.' })
  async shareRule(
    @CurrentAuth() auth: AuthContext,
    @Param('ruleId') ruleId: string,
  ): Promise<ShareRuleResponseDto> {
    const senderId = await this.authenticatedUsers.resolveActiveUserId(auth.cognitoSub);
    return this.rulesService.shareRule(this.parseId(ruleId), senderId);
  }

  @Delete(':ruleId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '?앺솢 洹쒖튃 ??젣', description: '?앺솢 洹쒖튃????젣?⑸땲??' })
  @ApiParam({ name: 'ruleId', type: Number, description: '??젣???앺솢 洹쒖튃 ID' })
  @ApiResponse({ status: 200, description: '?앺솢 洹쒖튃 ??젣 ?깃났', type: RuleResponseDto })
  @ApiResponse({ status: 400, description: '?섎せ??洹쒖튃 ID (COMMON_400)' })
  @ApiResponse({ status: 401, description: '?몄쬆???꾩슂?⑸땲??' })
  @ApiResponse({ status: 403, description: '?묎렐 沅뚰븳???놁뒿?덈떎.' })
  @ApiResponse({ status: 404, description: '洹쒖튃 ?놁쓬 (COMMON_404)' })
  async deleteRule(
    @CurrentAuth() auth: AuthContext,
    @Param('ruleId') ruleId: string,
  ): Promise<RuleResponseDto> {
    const requesterId = await this.authenticatedUsers.resolveActiveUserId(auth.cognitoSub);
    return this.rulesService.deleteRule(this.parseId(ruleId), requesterId);
  }
}


