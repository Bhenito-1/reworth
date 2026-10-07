import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminRole, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EMAIL_PROVIDER, type EmailProvider } from '../providers/email.provider';
import { renderNotificationEmail } from '../providers/email-templates';

export const ADMIN_ALERT_KINDS = [
  'LISTING_REVIEW',
  'APPEAL',
  'DISPUTE',
  'REPORT',
  'RISK',
  'SUPPORT',
] as const;

export type AdminAlertKind = (typeof ADMIN_ALERT_KINDS)[number];

export type AdminAlertInput = {
  roles: readonly AdminRole[];
  kind: AdminAlertKind;
  title: string;
  body: string;
  /** Admin app path, e.g. `/listings`. */
  href: string;
  entityType: string;
  entityId: string;
};

@Injectable()
export class AdminAlertsService {
  private readonly logger = new Logger(AdminAlertsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(EMAIL_PROVIDER) private readonly email: EmailProvider,
  ) {}

  /**
   * In-app ping plus email for every active admin who holds one of the roles.
   * Super admins are always included. An unread alert for the same entity is
   * not sent again. Failures are logged and do not break the caller.
   */
  async notify(input: AdminAlertInput): Promise<void> {
    try {
      await this.dispatch(input);
    } catch (err) {
      this.logger.warn(
        { err, kind: input.kind, entityId: input.entityId },
        'Admin alert failed',
      );
    }
  }

  async listFor(userId: string) {
    const [items, unread] = await Promise.all([
      this.prisma.adminAlert.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
      this.prisma.adminAlert.count({
        where: { userId, readAt: null },
      }),
    ]);
    return {
      unread,
      items: items.map((row) => ({
        id: row.id,
        kind: row.kind,
        title: row.title,
        body: row.body,
        href: row.href,
        entityType: row.entityType,
        entityId: row.entityId,
        readAt: row.readAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }

  async markRead(userId: string, id: string) {
    const updated = await this.prisma.adminAlert.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true, updated: updated.count };
  }

  async markAllRead(userId: string) {
    const updated = await this.prisma.adminAlert.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true, updated: updated.count };
  }

  private async dispatch(input: AdminAlertInput): Promise<void> {
    const roles = Array.from(
      new Set<AdminRole>([...input.roles, AdminRole.SUPER_ADMIN]),
    );
    const admins = await this.prisma.user.findMany({
      where: {
        status: UserStatus.ACTIVE,
        deletedAt: null,
        roles: { some: { role: { in: roles } } },
      },
      select: { id: true, email: true },
    });
    if (admins.length === 0) return;

    const link = this.adminUrl(input.href);
    for (const admin of admins) {
      const open = await this.prisma.adminAlert.findFirst({
        where: {
          userId: admin.id,
          kind: input.kind,
          entityId: input.entityId,
          readAt: null,
        },
        select: { id: true },
      });
      if (open) continue;

      await this.prisma.adminAlert.create({
        data: {
          userId: admin.id,
          kind: input.kind,
          title: input.title,
          body: input.body,
          href: input.href,
          entityType: input.entityType,
          entityId: input.entityId,
        },
      });

      if (!admin.email) continue;
      try {
        const drafted = renderNotificationEmail({
          title: input.title,
          body: link ? `${input.body}\n\nOpen in admin: ${link}` : input.body,
          deepLink: link,
          appUrl: this.adminOrigin(),
        });
        await this.email.send({
          to: admin.email,
          subject: input.title,
          text: drafted.text,
          html: drafted.html,
          meta: {
            emailCategory: 'admin-alert',
            entityRefId: `${input.kind}:${input.entityId}:${admin.id}`,
          },
        });
      } catch (err) {
        this.logger.warn(
          { err, userId: admin.id, kind: input.kind },
          'Admin alert email failed',
        );
      }
    }
  }

  private adminOrigin(): string | undefined {
    const raw =
      this.config.get<string>('ADMIN_ORIGIN') ??
      this.config.get<string>('ADMIN_URL');
    return raw?.trim().replace(/\/$/, '') || undefined;
  }

  private adminUrl(href: string): string | undefined {
    const origin = this.adminOrigin();
    if (!origin) return undefined;
    return `${origin}${href.startsWith('/') ? href : `/${href}`}`;
  }
}
