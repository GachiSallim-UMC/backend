import { randomUUID } from 'node:crypto';

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuthContext } from '../auth/common/auth-context.interface';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateReceiptImageUploadDto,
  RECEIPT_IMAGE_MAX_FILE_SIZE,
  ReceiptImageContentType,
} from './dto/create-receipt-image-upload.dto';
import { ReceiptImageUploadResponseDto } from './dto/receipt-image-upload-response.dto';
import { ReceiptImageViewResponseDto } from './dto/receipt-image-view.dto';
import { ExpenseNotFoundException } from './expenses.exception';
import { RECEIPT_IMAGE_S3_CLIENT } from './receipt-image.constants';

const RECEIPT_IMAGE_UPLOAD_EXPIRES_SECONDS = 5 * 60;
const RECEIPT_IMAGE_VIEW_EXPIRES_SECONDS = 5 * 60;
const RECEIPT_IMAGE_EXTENSIONS: Record<ReceiptImageContentType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

@Injectable()
export class ReceiptImageService {
  private readonly logger = new Logger(ReceiptImageService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    @Inject(RECEIPT_IMAGE_S3_CLIENT) private readonly s3: S3Client,
  ) {}

  private async getUserIdByAuth(auth: AuthContext): Promise<bigint> {
    const user = await this.prisma.user.findFirst({
      where: {
        authIdentities: {
          some: { cognitoSub: auth.cognitoSub },
        },
      },
      select: { id: true },
    });

    if (!user) {
      throw new ForbiddenException('인증된 사용자 정보를 DB에서 찾을 수 없습니다.');
    }
    return user.id;
  }

  private async assertGroupMember(userId: bigint, groupId: bigint): Promise<void> {
    const membership = await this.prisma.groupMember.findFirst({
      where: { groupId, userId, leftAt: null },
    });

    if (!membership) {
      throw new ForbiddenException('해당 그룹의 멤버만 영수증 이미지를 이용할 수 있습니다.');
    }
  }

  async createUpload(
    auth: AuthContext,
    dto: CreateReceiptImageUploadDto,
  ): Promise<ReceiptImageUploadResponseDto> {
    const userId = await this.getUserIdByAuth(auth);
    const groupId = BigInt(dto.groupId);
    await this.assertGroupMember(userId, groupId);

    const bucket = this.config.getOrThrow<string>('RECEIPT_IMAGE_BUCKET');
    const objectPrefix = this.config
      .getOrThrow<string>('RECEIPT_IMAGE_OBJECT_PREFIX')
      .replace(/^\/+|\/+$/g, '');
    const extension = RECEIPT_IMAGE_EXTENSIONS[dto.contentType];
    const objectKey = `${objectPrefix}/${groupId}/${userId}/${randomUUID()}.${extension}`;
    const expiresAt = new Date(Date.now() + RECEIPT_IMAGE_UPLOAD_EXPIRES_SECONDS * 1000);
    const upload = await createPresignedPost(this.s3, {
      Bucket: bucket,
      Key: objectKey,
      Expires: RECEIPT_IMAGE_UPLOAD_EXPIRES_SECONDS,
      Fields: {
        'Content-Type': dto.contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
      Conditions: [
        ['eq', '$Content-Type', dto.contentType],
        ['eq', '$Cache-Control', 'public, max-age=31536000, immutable'],
        ['content-length-range', 1, RECEIPT_IMAGE_MAX_FILE_SIZE],
      ],
    });

    return {
      uploadMethod: 'POST',
      uploadUrl: upload.url,
      fields: upload.fields,
      objectKey,
      expiresAt: expiresAt.toISOString(),
    };
  }

  assertReceiptKeyBelongsToGroup(groupId: bigint, receiptUrl: string): void {
    const objectPrefix = this.config
      .getOrThrow<string>('RECEIPT_IMAGE_OBJECT_PREFIX')
      .replace(/^\/+|\/+$/g, '');
    const expectedPrefix = `${objectPrefix}/${groupId}/`;

    if (!receiptUrl.startsWith(expectedPrefix)) {
      throw new BadRequestException('영수증 이미지가 해당 그룹에 속하지 않습니다.');
    }
  }

  async assertObjectExists(objectKey: string): Promise<void> {
    const bucket = this.config.getOrThrow<string>('RECEIPT_IMAGE_BUCKET');

    try {
      await this.s3.send(new HeadObjectCommand({ Bucket: bucket, Key: objectKey }));
    } catch (error) {
      if (this.getErrorName(error) === 'NotFound') {
        throw new BadRequestException('업로드가 완료되지 않은 영수증 이미지입니다.');
      }
      throw new InternalServerErrorException('영수증 이미지 확인 중 오류가 발생했습니다.');
    }
  }

  async deleteObject(objectKey: string): Promise<void> {
    const bucket = this.config.getOrThrow<string>('RECEIPT_IMAGE_BUCKET');

    try {
      await this.s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }));
    } catch (error) {
      // 정리용 삭제는 실패해도 호출자의 본 작업(지출 수정/삭제)을 막지 않는다.
      // 실패 시 S3에 고아 오브젝트가 남을 뿐이다.
      this.logger.warn(`영수증 이미지 삭제 실패: ${objectKey} - ${this.getErrorName(error)}`);
    }
  }

  private getErrorName(error: unknown): string | undefined {
    return typeof error === 'object' && error !== null && 'name' in error
      ? String((error as { name: unknown }).name)
      : undefined;
  }

  async createViewUrl(auth: AuthContext, expenseId: bigint): Promise<ReceiptImageViewResponseDto> {
    const userId = await this.getUserIdByAuth(auth);

    const expense = await this.prisma.expense.findUnique({
      where: { id: expenseId },
      select: { groupId: true, receiptUrl: true },
    });
    if (!expense) {
      throw new ExpenseNotFoundException();
    }

    await this.assertGroupMember(userId, expense.groupId);

    if (!expense.receiptUrl) {
      return { viewUrl: null, expiresAt: null };
    }

    const bucket = this.config.getOrThrow<string>('RECEIPT_IMAGE_BUCKET');
    const expiresAt = new Date(Date.now() + RECEIPT_IMAGE_VIEW_EXPIRES_SECONDS * 1000);
    const viewUrl = await getSignedUrl(
      this.s3,
      new GetObjectCommand({ Bucket: bucket, Key: expense.receiptUrl }),
      { expiresIn: RECEIPT_IMAGE_VIEW_EXPIRES_SECONDS },
    );

    return { viewUrl, expiresAt: expiresAt.toISOString() };
  }
}
