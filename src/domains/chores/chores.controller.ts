import { Body, Controller, Delete, Get, Headers, HttpCode, HttpStatus, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { BusinessException } from '../../common/exceptions/business.exception';
import { ErrorCode } from '../../common/constants/error-code.constant';
import { ChoresService } from './chores.service';
import { CreateChoreDto } from './dto/create-chore.dto';
import { ListChoresQueryDto } from './dto/list-chores-query.dto';
import { ShareChoreDto } from './dto/share-chore.dto';
import { UpdateChoreDto } from './dto/update-chore.dto';

@ApiTags('집안일 관리 (CHORE)')
@ApiBearerAuth('BearerAuth')
@Controller('chores')
export class ChoresController {
  constructor(private readonly choresService: ChoresService) {}

  @Get()
  @ApiOperation({ summary: '집안일 목록 조회' })
  listChores(@Query() query: ListChoresQueryDto) {
    return this.choresService.listChores(query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '집안일 등록 (CHORE-REG-01)' })
  @ApiHeader({ name: 'x-user-id', required: true, description: '임시 인증 헤더: 요청자 ID (AUTH 도입 전까지)' })
  createChore(@Body() dto: CreateChoreDto, @Headers('x-user-id') userIdHeader?: string) {
    const createdBy = this.requireUserId(userIdHeader);

    return this.choresService.createChore(dto, createdBy);
  }

  @Put(':choreId')
  @ApiOperation({ summary: '집안일 수정 (CHORE-EDIT-01)' })
  @ApiParam({ name: 'choreId', type: Number, example: 11 })
  @ApiHeader({ name: 'x-user-id', required: true, description: '임시 인증 헤더: 요청자 ID (AUTH 도입 전까지)' })
  updateChore(
    @Param('choreId') choreId: string,
    @Body() dto: UpdateChoreDto,
    @Headers('x-user-id') userIdHeader?: string,
  ) {
    this.requireUserId(userIdHeader);

    return this.choresService.updateChore(this.parseId(choreId, 'choreId'), dto);
  }

  @Patch(':choreId/complete')
  @ApiOperation({ summary: '집안일 완료 처리 (CHORE-DONE-01)' })
  @ApiParam({ name: 'choreId', type: Number, example: 11 })
  @ApiHeader({ name: 'x-user-id', required: true, description: '임시 인증 헤더: 완료 처리자 ID (AUTH 도입 전까지)' })
  completeChore(@Param('choreId') choreId: string, @Headers('x-user-id') userIdHeader?: string) {
    const completedBy = this.requireUserId(userIdHeader);

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
  @ApiHeader({ name: 'x-user-id', required: true, description: '임시 인증 헤더: 요청자 ID (AUTH 도입 전까지)' })
  incompleteChore(@Param('choreId') choreId: string, @Headers('x-user-id') userIdHeader?: string) {
    this.requireUserId(userIdHeader);

    return this.choresService.incompleteChore(this.parseId(choreId, 'choreId'));
  }

  @Delete(':choreId')
  @ApiOperation({ summary: '집안일 삭제 (CHORE-DEL-01)' })
  @ApiParam({ name: 'choreId', type: Number, example: 11 })
  @ApiHeader({ name: 'x-user-id', required: true, description: '임시 인증 헤더: 요청자 ID (AUTH 도입 전까지)' })
  deleteChore(@Param('choreId') choreId: string, @Headers('x-user-id') userIdHeader?: string) {
    const requesterId = this.requireUserId(userIdHeader);

    return this.choresService.deleteChore(this.parseId(choreId, 'choreId'), requesterId);
  }

  @Post(':choreId/share')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '집안일 메신저 공유 (CHORE-SHARE-01)' })
  @ApiParam({ name: 'choreId', type: Number, example: 11 })
  @ApiHeader({ name: 'x-user-id', required: true, description: '임시 인증 헤더: 공유(발신)자 ID (AUTH 도입 전까지)' })
  shareChore(
    @Param('choreId') choreId: string,
    @Body() dto: ShareChoreDto,
    @Headers('x-user-id') userIdHeader?: string,
  ) {
    const senderId = this.requireUserId(userIdHeader);

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

  private requireUserId(value?: string): bigint {
    if (!value || !/^\d+$/.test(value)) {
      throw new BusinessException(ErrorCode.AUTH_UNAUTHORIZED);
    }

    return BigInt(value);
  }
}
