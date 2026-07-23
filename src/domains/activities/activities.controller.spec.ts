import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { ActivitiesController } from './activities.controller';
import { ActivitiesService } from './activities.service';
import { GetActivityQueryDto } from './dto/get-activity-query.dto';
import { CognitoAccessTokenGuard } from '../auth/common/cognito-access-token.guard';
import { AuthContext } from '../auth/common/auth-context.interface';

describe('ActivitiesController', () => {
  let controller: ActivitiesController;

  const mockActivitiesService = {
    validateGroupMembership: jest.fn(),
    getActivities: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ActivitiesController],
      providers: [
        {
          provide: ActivitiesService,
          useValue: mockActivitiesService,
        },
      ],
    })
      .overrideGuard(CognitoAccessTokenGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ActivitiesController>(ActivitiesController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getActivities', () => {
    const mockAuthContext: AuthContext = {
      cognitoSub: 'test-cognito-sub',
      accessToken: 'test-access-token',
    };

    it('그룹 멤버 권한이 없는 경우 ForbiddenException(403)을 발생시켜야 한다', async () => {
      const queryDto: GetActivityQueryDto = { groupId: 9999, page: 1 };

      // 💡 validateGroupMembership 호출 시 ForbiddenException 발생하도록 설정
      mockActivitiesService.validateGroupMembership.mockRejectedValue(
        new ForbiddenException('해당 그룹의 활동 내역을 조회할 권한이 없습니다.'),
      );

      await expect(
        controller.getActivities(mockAuthContext, queryDto),
      ).rejects.toThrow(ForbiddenException);

      expect(mockActivitiesService.validateGroupMembership).toHaveBeenCalledWith(
        mockAuthContext.cognitoSub,
        queryDto.groupId,
      );
    });

    it('인증된 유저가 권한이 있는 그룹의 활동 내역을 조회할 경우 정상 응답을 반환해야 한다', async () => {
      const queryDto: GetActivityQueryDto = { groupId: 1, page: 1 };
      const expectedResult = { items: [], total: 0, page: 1 };

      // 💡 권한 검증 통과 및 결과 반환 설정
      mockActivitiesService.validateGroupMembership.mockResolvedValue(true);
      mockActivitiesService.getActivities.mockResolvedValue(expectedResult);

      const result = await controller.getActivities(mockAuthContext, queryDto);

      expect(result).toEqual(expectedResult);
      expect(mockActivitiesService.validateGroupMembership).toHaveBeenCalledWith(
        mockAuthContext.cognitoSub,
        queryDto.groupId,
      );
      expect(mockActivitiesService.getActivities).toHaveBeenCalledWith(queryDto);
    });
  });
});