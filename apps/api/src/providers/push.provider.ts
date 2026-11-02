export type PushMessage = {
  userId: string;
  title: string;
  body: string;
  deepLink?: string;
  subscriptions: Array<{
    id: string;
    endpoint: string;
    keys: { p256dh: string; auth: string };
  }>;
  meta?: Record<string, unknown>;
};

export interface PushProvider {
  readonly name: string;
  send(message: PushMessage): Promise<string[]>;
}

export const PUSH_PROVIDER = Symbol('PUSH_PROVIDER');
