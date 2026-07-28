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
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ErrorCode } from '../../common/constants/error-code.constant';
import { BusinessException } from '../../common/exceptions/business.exception';
import { AuthContext } from '../auth/common/auth-context.interface';
import { CognitoAccessTokenGuard } from '../auth/common/cognito-access-token.guard';
import { CurrentAuth } from '../auth/common/current-auth.decorator';
import { ChoresAuthenticatedUserService } from './chores-authenticated-user.service';
import { ChoresService } from './chores.service';
import { CreateChoreDto } from './dto/create-chore.dto';
import { ListChoresQueryDto } from './dto/list-chores-query.dto';
import { ShareChoreDto } from './dto/share-chore.dto';
import { UpdateChoreDto } from './dto/update-chore.dto';

@ApiTags('집안일 관리 (CHORE)')
@ApiBearerAuth('BearerAuth')
@UseGuards(CognitoAccessTokenGuard)
@Controller('chores')
export class ChoresController {
  constructor(
    private readonly choresService: ChoresService,
    private readonly authenticatedUsers: ChoresAuthenticatedUserService,
  ) {}

  @Get()
  @ApiOperation({ summary: '집안일 목록 조회' })
  @ApiResponse({ status: 401, description: '인증이 필요합니다.' })
  @ApiResponse({
    status: 403,
    description: 'GROUP_MEMBER_NOT_FOUND - 그룹에 속하지 않은 사용자입니다.',
  })
  async listChores(@CurrentAuth() auth: AuthContext, @Query() query: ListChoresQueryDto) {
    const requesterId = await this.authenticatedUsers.resolveActiveUserId(auth.cognitoSub);

    return this.choresService.listChores(query, requesterId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '집안일 등록 (CHORE-REG-01)' })
  @ApiResponse({ status: 401, description: '인증이 필요합니다.' })
  @ApiResponse({
    status: 403,
    description: 'GROUP_MEMBER_NOT_FOUND - 그룹에 속하지 않은 사용자입니다.',
  })
  async createChore(@CurrentAuth() auth: AuthContext, @Body() dto: CreateChoreDto) {
    const createdBy = await this.authenticatedUsers.resolveActiveUserId(auth.cognitoSub);

    return this.choresService.createChore(dto, createdBy);
  }

  @Put(':choreId')
  @ApiOperation({ summary: '집안일 수정 (CHORE-EDIT-01)' })
  @ApiParam({ name: 'choreId', type: Number, example: 11 })
  @ApiResponse({ status: 401, description: '인증이 필요합니다.' })
  @ApiResponse({
    status: 403,
    description: 'GROUP_MEMBER_NOT_FOUND - 그룹에 속하지 않은 사용자입니다.',
  })
  async updateChore(
    @CurrentAuth() auth: AuthContext,
    @Param('choreId') choreId: string,
    @Body() dto: UpdateChoreDto,
  ) {
    const requesterId = await this.authenticatedUsers.resolveActiveUserId(auth.cognitoSub);

    return this.choresService.updateChore(this.parseId(choreId, 'choreId'), dto, requesterId);
  }

  @Patch(':choreId/complete')
  @ApiOperation({ summary: '집안일 완료 처리 (CHORE-DONE-01)' })
  @ApiParam({ name: 'choreId', type: Number, example: 11 })
  @ApiResponse({ status: 401, description: '인증이 필요합니다.' })
  @ApiResponse({
    status: 403,
    description: 'GROUP_MEMBER_NOT_FOUND - 그룹에 속하지 않은 사용자입니다.',
  })
  async completeChore(@CurrentAuth() auth: AuthContext, @Param('choreId') choreId: string) {
    const completedBy = await this.authenticatedUsers.resolveActiveUserId(auth.cognitoSub);

    return this.choresService.completeChore(this.parseId(choreId, 'choreId'), completedBy);
  }

  @Patch(':choreId/incomplete')
  @ApiOperation({
    summary: '집안일 완료 취소 (CHORE-DONE-02)',
    description:
      '완료된 집안일을 미완료(PENDING)로 되돌립니다. 완료 처리 시 자동 생성된 다음 회차가 있으면 함께 삭제되며, ' +
      '삭제된 회차 ID는 removedNextOccurrenceIds로 반환됩니다.',
  })
  @ApiParam({ name: 'choreId', type: Number, example: 11 })
  @ApiResponse({ status: 401, description: '인증이 필요합니다.' })
  @ApiResponse({
    status: 403,
    description: 'GROUP_MEMBER_NOT_FOUND - 그룹에 속하지 않은 사용자입니다.',
  })
  async incompleteChore(@CurrentAuth() auth: AuthContext, @Param('choreId') choreId: string) {
    const requesterId = await this.authenticatedUsers.resolveActiveUserId(auth.cognitoSub);

    return this.choresService.incompleteChore(this.parseId(choreId, 'choreId'), requesterId);
  }

  @Delete(':choreId')
  @ApiOperation({ summary: '집안일 삭제 (CHORE-DEL-01)' })
  @ApiParam({ name: 'choreId', type: Number, example: 11 })
  @ApiResponse({ status: 401, description: '인증이 필요합니다.' })
  @ApiResponse({
    status: 403,
    description: 'GROUP_MEMBER_NOT_FOUND - 그룹에 속하지 않은 사용자입니다.',
  })
  async deleteChore(@CurrentAuth() auth: AuthContext, @Param('choreId') choreId: string) {
    const requesterId = await this.authenticatedUsers.resolveActiveUserId(auth.cognitoSub);

    return this.choresService.deleteChore(this.parseId(choreId, 'choreId'), requesterId);
  }

  @Post(':choreId/share')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '집안일 메신저 공유 (CHORE-SHARE-01)' })
  @ApiParam({ name: 'choreId', type: Number, example: 11 })
  @ApiResponse({ status: 401, description: '인증이 필요합니다.' })
  @ApiResponse({
    status: 403,
    description: 'GROUP_MEMBER_NOT_FOUND - 그룹에 속하지 않은 사용자입니다.',
  })
  async shareChore(
    @CurrentAuth() auth: AuthContext,
    @Param('choreId') choreId: string,
    @Body() dto: ShareChoreDto,
  ) {
    const senderId = await this.authenticatedUsers.resolveActiveUserId(auth.cognitoSub);

    return this.choresService.shareChore(
      this.parseId(choreId, 'choreId'),
      senderId,
      BigInt(dto.chatRoomId),
      dto.content,
    );
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
