import { Injectable, Logger } from '@nestjs/common';
import type { PushMessage, PushProvider } from './push.provider';

@Injectable()
export class MockPushProvider implements PushProvider {
  readonly name = 'mock-push';
  private readonly logger = new Logger(MockPushProvider.name);
  readonly sent: PushMessage[] = [];

  async send(message: PushMessage): Promise<string[]> {
    this.sent.push(message);
    this.logger.log(
      {
        userId: message.userId,
        title: message.title,
        subscriptions: message.subscriptions.length,
        deepLink: message.deepLink,
      },
      'push:mock',
    );
    return [];
  }
}
