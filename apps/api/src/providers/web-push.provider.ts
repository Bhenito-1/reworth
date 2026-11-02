import { Injectable, Logger } from '@nestjs/common';
import webpush from 'web-push';
import type { PushMessage, PushProvider } from './push.provider';

@Injectable()
export class WebPushProvider implements PushProvider {
  readonly name = 'web-push';
  private readonly logger = new Logger(WebPushProvider.name);

  constructor(
    publicKey: string,
    privateKey: string,
    subject: string,
    private readonly appUrl?: string,
  ) {
    webpush.setVapidDetails(subject, publicKey, privateKey);
  }

  async send(message: PushMessage): Promise<string[]> {
    const stale: string[] = [];
    const payload = JSON.stringify({
      title: message.title,
      body: message.body,
      url: this.resolveUrl(message.deepLink),
      tag: typeof message.meta?.conversationId === 'string'
        ? `conversation-${message.meta.conversationId}`
        : undefined,
    });
    await Promise.all(message.subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(subscription, payload, {
          TTL: 60 * 60 * 24,
          urgency: 'normal',
        });
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          stale.push(subscription.id);
          return;
        }
        this.logger.error(
          { statusCode, subscriptionId: subscription.id },
          'web push delivery failed',
        );
      }
    }));
    return stale;
  }

  private resolveUrl(deepLink?: string): string {
    if (!deepLink) return '/notifications';
    if (deepLink.startsWith('/')) return deepLink;
    if (deepLink.startsWith('reworth://')) {
      const path = deepLink.slice('reworth://'.length).replace(/^\/?/, '/');
      return path === '/' ? '/notifications' : path;
    }
    try {
      const url = new URL(deepLink);
      if (this.appUrl && url.origin === new URL(this.appUrl).origin) {
        return `${url.pathname}${url.search}${url.hash}`;
      }
    } catch {
      // Use the notifications page for invalid or external links.
    }
    return '/notifications';
  }
}
