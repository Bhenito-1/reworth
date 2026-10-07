import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  NotificationChannel,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  EMAIL_PROVIDER,
  type EmailProvider,
} from '../providers/email.provider';
import {
  renderNotificationEmail,
  resolvePublicAppUrl,
} from '../providers/email-templates';
import {
  PUSH_PROVIDER,
  type PushProvider,
} from '../providers/push.provider';
import {
  isCriticalCategory,
  PUSH_FREQUENCY_CAP_PER_HOUR,
} from './notification-categories';

export type NotifyInput = {
  userId: string;
  category: string;
  title: string;
  body: string;
  deepLink?: string;
  meta?: Record<string, unknown>;
  /** Override channels; default IN_APP + PUSH + EMAIL */
  channels?: NotificationChannel[];
  /** Send even when the user turned the category off or is in quiet hours. */
  forceDelivery?: boolean;
};

type CapBucket = { count: number; hourKey: string };

/**
 * Multi-channel notification engine (PRD §29).
 * Critical categories always get IN_APP at minimum.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  /** In-memory PUSH frequency caps: userId:conversationId → bucket */
  private readonly pushCaps = new Map<string, CapBucket>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(PUSH_PROVIDER) private readonly push: PushProvider,
    @Inject(EMAIL_PROVIDER) private readonly email: EmailProvider,
  ) {}

  /** Phase 4 stub compat — structured log only. */
  log(event: string, payload: Record<string, unknown>): void {
    this.logger.log({ event, ...payload }, `notify:${event}`);
  }

  async notify(input: NotifyInput): Promise<{
    created: { id: string; channel: NotificationChannel }[];
    skipped: { channel: NotificationChannel; reason: string }[];
  }> {
    const channels =
      input.channels ??
      ([
        NotificationChannel.IN_APP,
        NotificationChannel.PUSH,
        NotificationChannel.EMAIL,
      ] as NotificationChannel[]);

    const prefs = await this.prisma.notificationPreference.findMany({
      where: { userId: input.userId, category: input.category },
    });
    const prefMap = new Map(
      prefs.map((p) => [`${p.channel}`, p.enabled] as const),
    );

    const profile = await this.prisma.profile.findUnique({
      where: { userId: input.userId },
    });
    const user = await this.prisma.user.findUnique({
      where: { id: input.userId },
    });

    const created: { id: string; channel: NotificationChannel }[] = [];
    const skipped: { channel: NotificationChannel; reason: string }[] = [];
    const inQuietHours = this.isQuietHours(
      profile?.quietHoursStart ?? null,
      profile?.quietHoursEnd ?? null,
      new Date(),
    );

    for (const channel of channels) {
      const enabledPref = prefMap.get(channel);
      const userDisabled = enabledPref === false;
      const critical = isCriticalCategory(input.category);

      if (channel === NotificationChannel.IN_APP) {
        if (!input.forceDelivery && userDisabled && !critical) {
          skipped.push({ channel, reason: 'preference_disabled' });
          continue;
        }
        const row = await this.persist(input, channel);
        created.push({ id: row.id, channel });
        continue;
      }

      if (!input.forceDelivery && userDisabled) {
        skipped.push({ channel, reason: 'preference_disabled' });
        continue;
      }

      if (channel === NotificationChannel.PUSH) {
        if (!input.forceDelivery && inQuietHours) {
          skipped.push({ channel, reason: 'quiet_hours' });
          continue;
        }
        const conversationId =
          typeof input.meta?.conversationId === 'string'
            ? input.meta.conversationId
            : 'global';
        const cap = this.checkPushCap(input.userId, conversationId);
        if (!cap.allowed) {
          // Bundle excess into a digest IN_APP notification
          await this.persist(
            {
              ...input,
              category: input.category,
              title: 'Notification digest',
              body: `You have more updates in this conversation (push capped at ${PUSH_FREQUENCY_CAP_PER_HOUR}/hour).`,
              meta: {
                ...input.meta,
                digest: true,
                suppressedPush: true,
                originalTitle: input.title,
              },
            },
            NotificationChannel.IN_APP,
          );
          skipped.push({ channel, reason: 'frequency_cap_digest' });
          continue;
        }

        const tokens = await this.prisma.devicePushToken.findMany({
          where: { userId: input.userId },
        });
        const row = await this.persist(input, channel);
        created.push({ id: row.id, channel });
        await this.push.send({
          userId: input.userId,
          title: input.title,
          body: input.body,
          deepLink: input.deepLink,
          tokens: tokens.map((t) => t.token),
          meta: input.meta,
        });
        continue;
      }

      if (channel === NotificationChannel.EMAIL) {
        if (!input.forceDelivery && inQuietHours) {
          skipped.push({ channel, reason: 'quiet_hours' });
          continue;
        }
        const to = user?.email;
        if (!to) {
          skipped.push({ channel, reason: 'no_email' });
          continue;
        }
        const row = await this.persist(input, channel);
        created.push({ id: row.id, channel });
        const appUrl = resolvePublicAppUrl(
          this.config.get<string>('EMAIL_APP_URL'),
          this.config.get<string>('APP_URL'),
          this.config.get<string>('WEB_ORIGIN'),
        );
        const drafted = renderNotificationEmail({
          title: input.title,
          body: input.body,
          deepLink: input.deepLink,
          appUrl,
        });
        await this.email.send({
          to,
          subject: input.title,
          text: drafted.text,
          html: drafted.html,
          meta: {
            ...input.meta,
            emailCategory: 'notification',
            entityRefId:
              typeof input.meta?.entityRefId === 'string'
                ? input.meta.entityRefId
                : `notify-${row.id}`,
          },
        });
      }
    }

    return { created, skipped };
  }

  async unreadCount(userId: string) {
    const count = await this.prisma.notification.count({
      where: { userId, channel: 'IN_APP', readAt: null },
    });
    return { count };
  }

  async list(
    userId: string,
    opts: { category?: string; unread?: boolean } = {},
  ) {
    const where: Prisma.NotificationWhereInput = {
      userId,
      channel: 'IN_APP',
    };
    if (opts.category) where.category = opts.category;
    if (opts.unread === true) where.readAt = null;
    if (opts.unread === false) where.readAt = { not: null };

    return this.prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async markRead(userId: string, notificationId: string) {
    const row = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });
    if (!row || row.userId !== userId) {
      throw new NotFoundException('Notification not found');
    }
    if (row.readAt) return row;
    return this.prisma.notification.update({
      where: { id: notificationId },
      data: { readAt: new Date() },
    });
  }

  async markAllRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }

  /** Removes the in-app inbox. Push and email copies stay in their own channels. */
  async clearInbox(userId: string) {
    const result = await this.prisma.notification.deleteMany({
      where: { userId, channel: NotificationChannel.IN_APP },
    });
    return { deleted: result.count };
  }

  async getPreferences(userId: string) {
    return this.prisma.notificationPreference.findMany({
      where: { userId },
      orderBy: [{ category: 'asc' }, { channel: 'asc' }],
    });
  }

  async setPreference(
    userId: string,
    category: string,
    channel: NotificationChannel,
    enabled: boolean,
  ) {
    // Hard rule: critical categories cannot disable IN_APP
    let effective = enabled;
    if (
      channel === NotificationChannel.IN_APP &&
      isCriticalCategory(category) &&
      !enabled
    ) {
      effective = true;
    }

    return this.prisma.notificationPreference.upsert({
      where: {
        userId_category_channel: { userId, category, channel },
      },
      create: { userId, category, channel, enabled: effective },
      update: { enabled: effective },
    });
  }

  async registerPushToken(
    userId: string,
    token: string,
    platform: string,
  ) {
    return this.prisma.devicePushToken.upsert({
      where: { userId_token: { userId, token } },
      create: { userId, token, platform },
      update: { platform },
    });
  }

  /** Exported for tests. */
  isQuietHours(
    start: number | null,
    end: number | null,
    now: Date,
  ): boolean {
    if (start == null || end == null) return false;
    // Convert to WAT (UTC+1) hour
    const watHour = (now.getUTCHours() + 1) % 24;
    if (start === end) return false;
    if (start < end) {
      return watHour >= start && watHour < end;
    }
    // Wraps midnight (e.g. 22 → 7)
    return watHour >= start || watHour < end;
  }

  /** Exported for tests — reset caps between tests. */
  resetPushCaps(): void {
    this.pushCaps.clear();
  }

  checkPushCap(
    userId: string,
    conversationId: string,
  ): { allowed: boolean; count: number } {
    const hourKey = new Date().toISOString().slice(0, 13);
    const key = `${userId}:${conversationId}`;
    const bucket = this.pushCaps.get(key);
    if (!bucket || bucket.hourKey !== hourKey) {
      this.pushCaps.set(key, { count: 1, hourKey });
      return { allowed: true, count: 1 };
    }
    if (bucket.count >= PUSH_FREQUENCY_CAP_PER_HOUR) {
      return { allowed: false, count: bucket.count };
    }
    bucket.count += 1;
    return { allowed: true, count: bucket.count };
  }

  private async persist(input: NotifyInput, channel: NotificationChannel) {
    return this.prisma.notification.create({
      data: {
        userId: input.userId,
        category: input.category,
        channel,
        title: input.title,
        body: input.body,
        deepLink: input.deepLink ?? null,
        meta: (input.meta ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }
}
