import { Controller, Post, Get, Body, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ActivitiesService } from './activities.service';
import { CreateActivityDto } from './dto/create-activity.dto';
import { GetActivityQueryDto } from './dto/get-activity-query.dto';

@ApiTags('최근 활동 내역 (ACT)')
@Controller('activities') 
export class ActivitiesController {
  constructor(private readonly activitiesService: ActivitiesService) {}

  // ACT-LOG-01: 활동 자동/백그라운드 기록
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createActivity(@Body() createActivityDto: CreateActivityDto) {
    return this.activitiesService.logActivity(createActivityDto);
  }

  // ACT-LIST-01: 활동 목록 조회 및 타임라인 상세 라우팅
  @Get()
  @HttpCode(HttpStatus.OK)
  async getActivities(@Query() query: GetActivityQueryDto) {
    return this.activitiesService.getActivities(query);
  }
}