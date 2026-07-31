import { ApiGatewayManagementApiClient } from '@aws-sdk/client-apigatewaymanagementapi';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  CHAT_CONNECTIONS_DYNAMODB_CLIENT,
  CHAT_WEBSOCKET_MANAGEMENT_CLIENT,
} from './chat-broadcast.constants';

export function createChatConnectionsDynamoDbClient(
  configService: ConfigService,
): DynamoDBDocumentClient {
  return DynamoDBDocumentClient.from(
    new DynamoDBClient({ region: configService.getOrThrow<string>('AWS_REGION') }),
  );
}

export function createChatWebSocketManagementClient(
  configService: ConfigService,
): ApiGatewayManagementApiClient {
  return new ApiGatewayManagementApiClient({
    region: configService.getOrThrow<string>('AWS_REGION'),
    endpoint: configService.getOrThrow<string>('CHAT_WEBSOCKET_CALLBACK_URL'),
  });
}

export const CHAT_CONNECTIONS_DYNAMODB_CLIENT_PROVIDER: Provider = {
  provide: CHAT_CONNECTIONS_DYNAMODB_CLIENT,
  inject: [ConfigService],
  useFactory: createChatConnectionsDynamoDbClient,
};

export const CHAT_WEBSOCKET_MANAGEMENT_CLIENT_PROVIDER: Provider = {
  provide: CHAT_WEBSOCKET_MANAGEMENT_CLIENT,
  inject: [ConfigService],
  useFactory: createChatWebSocketManagementClient,
};
