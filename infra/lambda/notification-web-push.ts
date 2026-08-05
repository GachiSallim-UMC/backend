import type { SQSBatchResponse, SQSEvent, SQSRecord } from 'aws-lambda';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import webPush from 'web-push';

import type { NotificationPushJobV1 } from '../../src/domains/notifications/notification-push-job.interface';
import type { NotificationPushResultV1 } from '../../src/domains/notifications/notification-push-result.interface';

interface VapidSecret {
  publicKey: string;
  privateKey: string;
  subject: string;
}

interface WorkerDependencies {
  configureVapid: (secret: VapidSecret) => void;
  getVapidSecret: () => Promise<VapidSecret>;
  sendPush: typeof webPush.sendNotification;
  sendResult: (result: NotificationPushResultV1) => Promise<void>;
}

interface PushError extends Error {
  statusCode?: number;
}

const secrets = new SecretsManagerClient({ maxAttempts: 3 });
const sqs = new SQSClient({ maxAttempts: 3 });
let cachedVapidSecret: VapidSecret | undefined;

export function createHandler(dependencies: WorkerDependencies) {
  return async (event: SQSEvent): Promise<SQSBatchResponse> => {
    const batchItemFailures: SQSBatchResponse['batchItemFailures'] = [];

    for (const record of event.Records) {
      try {
        await processRecord(record, dependencies);
      } catch (error) {
        log('TRANSIENT_FAILURE', record.messageId, errorName(error));
        batchItemFailures.push({ itemIdentifier: record.messageId });
      }
    }

    return { batchItemFailures };
  };
}

async function processRecord(record: SQSRecord, dependencies: WorkerDependencies): Promise<void> {
  let job: NotificationPushJobV1;
  try {
    job = parseJob(record.body);
  } catch (error) {
    log('INVALID_JOB', record.messageId, errorName(error));
    const identity = parseJobIdentity(record.body);
    if (!identity) {
      throw error;
    }
    await dependencies.sendResult({
      version: 1,
      ...identity,
      outcome: 'FAILED',
      errorCode: 'PUSH_JOB_INVALID',
    });
    return;
  }

  const vapid = await dependencies.getVapidSecret();
  dependencies.configureVapid(vapid);
  const notificationUrl = `/notifications/${job.notification.notificationId}${
    job.notification.groupId === null ? '' : `?groupId=${job.notification.groupId}`
  }`;

  try {
    await dependencies.sendPush(
      {
        endpoint: job.subscription.endpoint,
        keys: job.subscription.keys,
      },
      JSON.stringify({
        notificationId: job.notification.notificationId,
        type: job.notification.type,
        message: job.notification.message,
        url: notificationUrl,
      }),
      { TTL: 300, urgency: 'normal', topic: `notification-${job.notification.notificationId}` },
    );
    try {
      await dependencies.sendResult(result(job, 'SENT'));
    } catch (error) {
      logResultPublishFailureAfterPush(record, job.deliveryId, error);
      throw error;
    }
    log('SENT', record.messageId);
  } catch (error) {
    const statusCode = (error as PushError).statusCode;
    if (statusCode === 404 || statusCode === 410) {
      await dependencies.sendResult(result(job, 'EXPIRED', `PUSH_${statusCode}`));
      log('EXPIRED', record.messageId, `PUSH_${statusCode}`);
      return;
    }
    if (statusCode !== undefined && statusCode >= 400 && statusCode < 500 && statusCode !== 429) {
      await dependencies.sendResult(result(job, 'FAILED', `PUSH_${statusCode}`));
      log('PERMANENT_FAILURE', record.messageId, `PUSH_${statusCode}`);
      return;
    }
    throw error;
  }
}

function parseJob(body: string): NotificationPushJobV1 {
  const job = JSON.parse(body) as Partial<NotificationPushJobV1>;
  if (
    job.version !== 1 ||
    !positiveInteger(job.deliveryId) ||
    !positiveInteger(job.notification?.notificationId) ||
    (job.notification?.groupId !== null && !positiveInteger(job.notification?.groupId)) ||
    !positiveInteger(job.subscription?.subscriptionId) ||
    typeof job.notification?.type !== 'string' ||
    typeof job.notification.message !== 'string' ||
    typeof job.subscription?.endpoint !== 'string' ||
    typeof job.subscription.keys?.p256dh !== 'string' ||
    typeof job.subscription.keys.auth !== 'string'
  ) {
    throw new Error('PUSH_JOB_INVALID');
  }
  return job as NotificationPushJobV1;
}

function parseJobIdentity(
  body: string,
): Pick<NotificationPushResultV1, 'deliveryId' | 'subscriptionId'> | null {
  try {
    const job = JSON.parse(body) as Partial<NotificationPushJobV1>;
    if (!positiveInteger(job.deliveryId) || !positiveInteger(job.subscription?.subscriptionId)) {
      return null;
    }
    return {
      deliveryId: job.deliveryId,
      subscriptionId: job.subscription.subscriptionId,
    };
  } catch {
    return null;
  }
}

function result(
  job: NotificationPushJobV1,
  outcome: NotificationPushResultV1['outcome'],
  errorCode?: string,
): NotificationPushResultV1 {
  return {
    version: 1,
    deliveryId: job.deliveryId,
    subscriptionId: job.subscription.subscriptionId,
    outcome,
    ...(errorCode ? { errorCode } : {}),
  };
}

function positiveInteger(value: unknown): value is string {
  return typeof value === 'string' && /^[1-9]\d*$/.test(value);
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : 'UNKNOWN_ERROR';
}

function log(outcome: string, messageId: string, errorCode?: string): void {
  console.log(JSON.stringify({ event: 'notification_web_push', outcome, messageId, errorCode }));
}

function logResultPublishFailureAfterPush(
  record: SQSRecord,
  deliveryId: string,
  error: unknown,
): void {
  console.warn(
    JSON.stringify({
      event: 'notification_web_push',
      outcome: 'RESULT_PUBLISH_FAILURE_AFTER_PUSH',
      messageId: record.messageId,
      deliveryId,
      receiveCount: Number(record.attributes.ApproximateReceiveCount),
      errorCode: errorName(error),
    }),
  );
}

async function getVapidSecret(): Promise<VapidSecret> {
  if (cachedVapidSecret) {
    return cachedVapidSecret;
  }
  const secretId = requiredEnvironment('NOTIFICATION_VAPID_SECRET_ID');
  const response = await secrets.send(new GetSecretValueCommand({ SecretId: secretId }));
  if (!response.SecretString) {
    throw new Error('VAPID_SECRET_STRING_REQUIRED');
  }
  const parsed = JSON.parse(response.SecretString) as Partial<VapidSecret>;
  if (
    typeof parsed.publicKey !== 'string' ||
    typeof parsed.privateKey !== 'string' ||
    typeof parsed.subject !== 'string'
  ) {
    throw new Error('VAPID_SECRET_INVALID');
  }
  cachedVapidSecret = parsed as VapidSecret;
  return cachedVapidSecret;
}

async function sendResult(resultMessage: NotificationPushResultV1): Promise<void> {
  await sqs.send(
    new SendMessageCommand({
      QueueUrl: requiredEnvironment('NOTIFICATION_PUSH_RESULT_QUEUE_URL'),
      MessageBody: JSON.stringify(resultMessage),
    }),
  );
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name}_REQUIRED`);
  }
  return value;
}

export const handler = createHandler({
  configureVapid: (vapid) =>
    webPush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey),
  getVapidSecret,
  sendPush: webPush.sendNotification.bind(webPush),
  sendResult,
});
