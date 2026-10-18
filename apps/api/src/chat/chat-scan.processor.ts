import { Injectable, Logger, Optional } from '@nestjs/common';
import { AdminAlertsService } from '../admin/admin-alerts.service';
import { FRAUD } from '../admin/admin-roles';
import { PrismaService } from '../prisma/prisma.service';
import { ChatScanService, type ScanHit } from './chat-scan.service';

/**
 * Async-shaped scanner — Phase 4 runs inline (no BullMQ required).
 */
@Injectable()
export class ChatScanProcessor {
  private readonly logger = new Logger(ChatScanProcessor.name);

  constructor(
    private readonly scan: ChatScanService,
    private readonly prisma: PrismaService,
    @Optional() private readonly alerts?: AdminAlertsService,
  ) {}

  async processMessage(params: {
    messageId: string;
    body: string | null;
    userId: string;
    listingId: string;
  }): Promise<{ scamWarning: boolean; hit: ScanHit | null }> {
    const hit = await this.scan.scan(params.body);
    if (!hit) return { scamWarning: false, hit: null };

    await this.prisma.message.update({
      where: { id: params.messageId },
      data: { scamWarning: true },
    });
    await this.prisma.riskEvent.create({
      data: {
        userId: params.userId,
        listingId: params.listingId,
        kind: `CHAT_SCAN_${hit.kind}`,
        score: 40,
        detail: {
          messageId: params.messageId,
          pattern: hit.pattern,
          kind: hit.kind,
        },
      },
    });
    await this.alerts?.notify({
      roles: FRAUD,
      kind: 'RISK',
      title: 'Chat scam signal',
      body: `A message matched ${hit.kind}.`,
      href: '/fraud',
      entityType: 'Message',
      entityId: params.messageId,
    });
    this.logger.warn(
      `Scam scan hit on message ${params.messageId}: ${hit.kind}`,
    );
    return { scamWarning: true, hit };
  }
}
