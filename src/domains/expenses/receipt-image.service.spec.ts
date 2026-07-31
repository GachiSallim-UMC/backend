import { S3Client } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { BadRequestException, ForbiddenException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../../prisma/prisma.service';
import { RECEIPT_IMAGE_MAX_FILE_SIZE } from './dto/create-receipt-image-upload.dto';
import { ExpenseNotFoundException } from './expenses.exception';
import { ReceiptImageService } from './receipt-image.service';

jest.mock('@aws-sdk/s3-presigned-post', () => ({
  createPresignedPost: jest.fn(),
}));
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

describe('ReceiptImageService', () => {
  const getOrThrow = jest.fn((key: string) => {
    const values: Record<string, string> = {
      RECEIPT_IMAGE_BUCKET: 'receipt-bucket',
      RECEIPT_IMAGE_OBJECT_PREFIX: 'develop/receipts',
    };
    return values[key];
  });
  const findFirstUser = jest.fn().mockResolvedValue({ id: 7n });
  const findFirstGroupMember = jest.fn().mockResolvedValue({ id: 1n });
  const findUniqueExpense = jest.fn();
  const send = jest.fn();
  const s3 = { send } as unknown as S3Client;
  const service = new ReceiptImageService(
    { getOrThrow } as unknown as ConfigService,
    {
      user: { findFirst: findFirstUser },
      groupMember: { findFirst: findFirstGroupMember },
      expense: { findUnique: findUniqueExpense },
    } as unknown as PrismaService,
    s3,
  );
  const presign = jest.mocked(createPresignedPost);
  const signGet = jest.mocked(getSignedUrl);
  const auth = { cognitoSub: 'cognito-sub', accessToken: 'token' };

  beforeEach(() => {
    jest.clearAllMocks();
    findFirstUser.mockResolvedValue({ id: 7n });
    findFirstGroupMember.mockResolvedValue({ id: 1n });
    presign.mockResolvedValue({
      url: 'https://receipt-bucket.s3.ap-northeast-2.amazonaws.com',
      fields: { key: 'signed-key', policy: 'signed-policy' },
    });
    signGet.mockResolvedValue('https://receipt-bucket.s3.ap-northeast-2.amazonaws.com/signed-get');
  });

  describe('createUpload', () => {
    it('creates a group- and user-scoped five-minute presigned POST for a group member', async () => {
      const result = await service.createUpload(auth, {
        groupId: 1,
        contentType: 'image/jpeg',
        fileSize: 1024,
      });

      expect(findFirstGroupMember).toHaveBeenCalledWith({
        where: { groupId: 1n, userId: 7n, leftAt: null },
      });
      expect(presign).toHaveBeenCalledTimes(1);
      const options = presign.mock.calls[0][1];
      expect(presign.mock.calls[0][0]).toBe(s3);
      expect(options.Bucket).toBe('receipt-bucket');
      expect(options.Key).toMatch(/^develop\/receipts\/1\/7\/[0-9a-f-]+\.jpg$/);
      expect(options.Expires).toBe(300);
      expect(options.Conditions).toContainEqual(['eq', '$Content-Type', 'image/jpeg']);
      expect(options.Conditions).toContainEqual([
        'content-length-range',
        1,
        RECEIPT_IMAGE_MAX_FILE_SIZE,
      ]);
      expect(result.uploadMethod).toBe('POST');
      expect(result.uploadUrl).toBe('https://receipt-bucket.s3.ap-northeast-2.amazonaws.com');
      expect(result.fields).toEqual({ key: 'signed-key', policy: 'signed-policy' });
      expect(result.objectKey).toMatch(/^develop\/receipts\/1\/7\/[0-9a-f-]+\.jpg$/);
      expect(result).not.toHaveProperty('receiptImageUrl');
      expect(Date.parse(result.expiresAt)).toBeGreaterThan(Date.now());
    });

    it('throws when the requester is not a member of the group', async () => {
      findFirstGroupMember.mockResolvedValueOnce(null);

      await expect(
        service.createUpload(auth, { groupId: 1, contentType: 'image/jpeg', fileSize: 1024 }),
      ).rejects.toThrow(ForbiddenException);
      expect(presign).not.toHaveBeenCalled();
    });

    it('throws when the authenticated user cannot be found', async () => {
      findFirstUser.mockResolvedValueOnce(null);

      await expect(
        service.createUpload(auth, { groupId: 1, contentType: 'image/jpeg', fileSize: 1024 }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('createViewUrl', () => {
    it('returns a short-lived signed URL for a group member', async () => {
      findUniqueExpense.mockResolvedValue({
        groupId: 1n,
        receiptUrl: 'develop/receipts/1/7/550e8400.jpg',
      });

      const result = await service.createViewUrl(auth, 123n);

      expect(findUniqueExpense).toHaveBeenCalledWith({
        where: { id: 123n },
        select: { groupId: true, receiptUrl: true },
      });
      expect(findFirstGroupMember).toHaveBeenCalledWith({
        where: { groupId: 1n, userId: 7n, leftAt: null },
      });
      expect(signGet).toHaveBeenCalledTimes(1);
      const [client, command, options] = signGet.mock.calls[0];
      expect(client).toBe(s3);
      expect(command.input).toEqual({
        Bucket: 'receipt-bucket',
        Key: 'develop/receipts/1/7/550e8400.jpg',
      });
      expect(options).toEqual({ expiresIn: 300 });
      expect(result.viewUrl).toBe('https://receipt-bucket.s3.ap-northeast-2.amazonaws.com/signed-get');
      expect(Date.parse(result.expiresAt)).toBeGreaterThan(Date.now());
    });

    it('throws when the expense does not exist', async () => {
      findUniqueExpense.mockResolvedValue(null);

      await expect(service.createViewUrl(auth, 999n)).rejects.toThrow(ExpenseNotFoundException);
    });

    it('throws when the expense has no receipt image attached', async () => {
      findUniqueExpense.mockResolvedValue({ groupId: 1n, receiptUrl: null });

      await expect(service.createViewUrl(auth, 123n)).rejects.toThrow(BadRequestException);
    });

    it('throws when the requester is not a member of the expense group', async () => {
      findUniqueExpense.mockResolvedValue({
        groupId: 1n,
        receiptUrl: 'develop/receipts/1/7/550e8400.jpg',
      });
      findFirstGroupMember.mockResolvedValueOnce(null);

      await expect(service.createViewUrl(auth, 123n)).rejects.toThrow(ForbiddenException);
      expect(signGet).not.toHaveBeenCalled();
    });
  });

  describe('assertReceiptKeyBelongsToGroup', () => {
    it('accepts a key scoped to the given group', () => {
      expect(() =>
        service.assertReceiptKeyBelongsToGroup(1n, 'develop/receipts/1/7/550e8400.jpg'),
      ).not.toThrow();
    });

    it('rejects a key scoped to a different group', () => {
      expect(() =>
        service.assertReceiptKeyBelongsToGroup(1n, 'develop/receipts/2/7/550e8400.jpg'),
      ).toThrow(BadRequestException);
    });

    it('rejects a key whose group id is merely a numeric prefix of the target group', () => {
      // "1" must not match a stored key for group "10" via a loose prefix check.
      expect(() =>
        service.assertReceiptKeyBelongsToGroup(1n, 'develop/receipts/10/7/550e8400.jpg'),
      ).toThrow(BadRequestException);
    });

    it('rejects an arbitrary external URL', () => {
      expect(() =>
        service.assertReceiptKeyBelongsToGroup(1n, 'https://evil.example.com/phish.jpg'),
      ).toThrow(BadRequestException);
    });
  });

  describe('assertObjectExists', () => {
    it('resolves when the object exists in S3', async () => {
      send.mockResolvedValueOnce({});

      await expect(
        service.assertObjectExists('develop/receipts/1/7/550e8400.jpg'),
      ).resolves.toBeUndefined();
      const calls = send.mock.calls as Array<[{ input: unknown }]>;
      const command = calls[0][0];
      expect(command.input).toEqual({
        Bucket: 'receipt-bucket',
        Key: 'develop/receipts/1/7/550e8400.jpg',
      });
    });

    it('throws BadRequestException when the object was never uploaded', async () => {
      send.mockRejectedValueOnce({ name: 'NotFound' });

      await expect(
        service.assertObjectExists('develop/receipts/1/7/550e8400.jpg'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws InternalServerErrorException on unexpected S3 errors', async () => {
      send.mockRejectedValueOnce({ name: 'ServiceUnavailable' });

      await expect(
        service.assertObjectExists('develop/receipts/1/7/550e8400.jpg'),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('deleteObject', () => {
    it('deletes the object from S3', async () => {
      send.mockResolvedValueOnce({});

      await service.deleteObject('develop/receipts/1/7/550e8400.jpg');

      const calls = send.mock.calls as Array<[{ input: unknown }]>;
      const command = calls[0][0];
      expect(command.input).toEqual({
        Bucket: 'receipt-bucket',
        Key: 'develop/receipts/1/7/550e8400.jpg',
      });
    });

    it('swallows S3 errors instead of throwing (best-effort cleanup)', async () => {
      send.mockRejectedValueOnce(new Error('boom'));

      await expect(
        service.deleteObject('develop/receipts/1/7/550e8400.jpg'),
      ).resolves.toBeUndefined();
    });
  });
});
