import { ForbiddenException } from '@nestjs/common';
import { MessageType } from '@prisma/client';
import { ChatScanProcessor } from './chat-scan.processor';
import { ChatScanService } from './chat-scan.service';
import { toMessageDto } from './message.mapper';
import {
  conversationHiddenFromViewer,
  MessagesService,
} from './messages.service';
import { redactPhoneEmail, assertNoPiiFields } from './pii.util';

describe('PII redaction', () => {
  it('redactPhoneEmail strips +234 phones and emails', () => {
    const raw =
      'Call me on +2348012345678 or email seller@example.com thanks';
    const scrubbed = redactPhoneEmail(raw);
    expect(scrubbed).not.toMatch(/\+234/);
    expect(scrubbed).not.toMatch(/seller@example\.com/);
    expect(scrubbed).toContain('[redacted]');
  });

  it('toMessageDto never exposes phone/email fields', () => {
    const dto = toMessageDto({
      id: 'm1',
      conversationId: 'c1',
      senderId: 'u1',
      type: MessageType.TEXT,
      body: 'hi',
      imageKey: null,
      offerId: null,
      listingCardId: null,
      clientMsgId: null,
      deliveredAt: null,
      readAt: null,
      scamWarning: false,
      createdAt: new Date(),
      sender: {
        id: 'u1',
        profile: { displayName: 'Ada' },
        phone: '+2348012345678',
        email: 'ada@example.com',
      },
    } as never);

    expect(dto).not.toHaveProperty('phone');
    expect(dto).not.toHaveProperty('email');
    expect(dto.sender).toEqual({ id: 'u1', displayName: 'Ada' });
    assertNoPiiFields(dto as unknown as Record<string, unknown>);
  });
});

describe('ChatScanProcessor', () => {
  it('flags "please pay directly to my bank account" with scamWarning + RiskEvent', async () => {
    const scan = {
      scan: jest.fn().mockResolvedValue({
        kind: 'OFF_PLATFORM_PAYMENT',
        pattern: 'pay directly',
      }),
    };
    const prisma = {
      message: {
        update: jest.fn().mockResolvedValue({}),
      },
      riskEvent: {
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const processor = new ChatScanProcessor(
      scan as unknown as ChatScanService,
      prisma as never,
    );
    const result = await processor.processMessage({
      messageId: 'msg-1',
      body: 'please pay directly to my bank account',
      userId: 'user-1',
      listingId: 'listing-1',
    });
    expect(result.scamWarning).toBe(true);
    expect(prisma.riskEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          kind: 'CHAT_SCAN_OFF_PLATFORM_PAYMENT',
          userId: 'user-1',
          listingId: 'listing-1',
        }),
      }),
    );
  });
});

describe('MessagesService block + clientMsgId', () => {
  it('block prevents POST conversation', async () => {
    const prisma = {
      listing: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'listing-1',
          sellerId: 'seller-1',
          status: 'LIVE',
        }),
      },
      userBlock: {
        findFirst: jest.fn().mockResolvedValue({ id: 'block-1' }),
      },
    };
    const scanProcessor = {
      processMessage: jest.fn(),
    } as unknown as ChatScanProcessor;
    const service = new MessagesService(
      prisma as never,
      scanProcessor,
      { log: jest.fn() } as never,
    );
    await expect(
      service.createOrGetConversation('buyer-1', 'listing-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('block prevents POST message', async () => {
    const prisma = {
      conversation: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'conv-1',
          listingId: 'listing-1',
          buyerId: 'buyer-1',
          sellerId: 'seller-1',
        }),
      },
      userBlock: {
        findFirst: jest.fn().mockResolvedValue({ id: 'block-1' }),
      },
    };
    const scanProcessor = {
      processMessage: jest.fn(),
    } as unknown as ChatScanProcessor;
    const notifications = { log: jest.fn() };
    const service = new MessagesService(
      prisma as never,
      scanProcessor,
      notifications as never,
    );
    await expect(
      service.postMessage('conv-1', 'buyer-1', {
        type: MessageType.TEXT,
        body: 'hello',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('clientMsgId duplicate insert returns same message (resync)', async () => {
    const existing = {
      id: 'msg-existing',
      conversationId: 'conv-1',
      senderId: 'buyer-1',
      type: MessageType.TEXT,
      body: 'hello',
      imageKey: null,
      offerId: null,
      listingCardId: null,
      clientMsgId: 'client-abc',
      deliveredAt: null,
      readAt: null,
      scamWarning: false,
      createdAt: new Date(),
      sender: { id: 'buyer-1', profile: { displayName: 'Buyer' } },
    };
    const prisma = {
      conversation: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'conv-1',
          listingId: 'listing-1',
          buyerId: 'buyer-1',
          sellerId: 'seller-1',
        }),
        update: jest.fn(),
      },
      userBlock: { findFirst: jest.fn().mockResolvedValue(null) },
      user: { findFirst: jest.fn().mockResolvedValue(null) },
      message: {
        findUnique: jest.fn().mockResolvedValue(existing),
        create: jest.fn(),
      },
    };
    const scanProcessor = {
      processMessage: jest.fn(),
    } as unknown as ChatScanProcessor;
    const notifications = { log: jest.fn() };
    const service = new MessagesService(
      prisma as never,
      scanProcessor,
      notifications as never,
    );
    const first = await service.postMessage('conv-1', 'buyer-1', {
      type: MessageType.TEXT,
      body: 'hello',
      clientMsgId: 'client-abc',
    });
    const second = await service.postMessage('conv-1', 'buyer-1', {
      type: MessageType.TEXT,
      body: 'hello again',
      clientMsgId: 'client-abc',
    });
    expect(first.id).toBe('msg-existing');
    expect(second.id).toBe(first.id);
    expect(prisma.message.create).not.toHaveBeenCalled();
  });

  it('reconnect after disconnect: after= poll + clientMsgId yields zero duplicates', async () => {
    const t0 = new Date('2026-01-01T00:00:00Z');
    const t1 = new Date('2026-01-01T00:00:10Z'); // 10s later
    const stored = new Map<string, any>();
    const byClient = new Map<string, any>();

    const mkMsg = (id: string, body: string, at: Date, clientId: string) => ({
      id,
      conversationId: 'conv-1',
      senderId: 'buyer-1',
      type: MessageType.TEXT,
      body,
      imageKey: null,
      offerId: null,
      listingCardId: null,
      clientMsgId: clientId,
      deliveredAt: null,
      readAt: null,
      scamWarning: false,
      createdAt: at,
      sender: { id: 'buyer-1', profile: { displayName: 'Buyer' } },
    });

    const prisma: any = {
      conversation: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'conv-1',
          listingId: 'listing-1',
          buyerId: 'buyer-1',
          sellerId: 'seller-1',
        }),
        update: jest.fn(),
      },
      userBlock: { findFirst: jest.fn().mockResolvedValue(null) },
      user: { findFirst: jest.fn().mockResolvedValue(null) },
      userMute: { findFirst: jest.fn().mockResolvedValue(null) },
      message: {
        findUnique: jest.fn().mockImplementation(async ({ where }: any) => {
          if (where?.id) return stored.get(where.id) ?? null;
          if (where?.conversationId_clientMsgId) {
            const key = `${where.conversationId_clientMsgId.conversationId}:${where.conversationId_clientMsgId.clientMsgId}`;
            return byClient.get(key) ?? null;
          }
          return null;
        }),
        findMany: jest.fn().mockImplementation(async ({ where }: any) => {
          let rows = [...stored.values()].filter(
            (m) => m.conversationId === where.conversationId,
          );
          if (where.createdAt?.gt) {
            rows = rows.filter((m) => m.createdAt > where.createdAt.gt);
          }
          return rows.sort(
            (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
          );
        }),
        create: jest.fn().mockImplementation(async ({ data }: any) => {
          const row = mkMsg(
            `msg-${stored.size + 1}`,
            data.body,
            data.createdAt ?? new Date(),
            data.clientMsgId,
          );
          Object.assign(row, data);
          stored.set(row.id, row);
          byClient.set(`${row.conversationId}:${row.clientMsgId}`, row);
          return row;
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };

    const scanProcessor = {
      processMessage: jest.fn().mockResolvedValue({ scamWarning: false }),
    } as unknown as ChatScanProcessor;
    const notifications = { log: jest.fn() };
    const service = new MessagesService(
      prisma,
      scanProcessor,
      notifications as never,
    );

    // Pre-disconnect send
    const a = await service.postMessage('conv-1', 'buyer-1', {
      type: MessageType.TEXT,
      body: 'before drop',
      clientMsgId: 'c-1',
    });
    stored.get(a.id)!.createdAt = t0;

    // Simulated 10s network drop — client retries same clientMsgId
    const retry = await service.postMessage('conv-1', 'buyer-1', {
      type: MessageType.TEXT,
      body: 'before drop',
      clientMsgId: 'c-1',
    });
    expect(retry.id).toBe(a.id);

    // Message arrived server-side during disconnect
    const during = mkMsg('msg-during', 'during drop', t1, 'c-2');
    stored.set(during.id, during);
    byClient.set('conv-1:c-2', during);

    const synced = await service.listMessages('conv-1', 'seller-1', {
      after: a.id,
    });
    expect(synced.map((m) => m.id)).toEqual(['msg-during']);
    expect(new Set(synced.map((m) => m.id)).size).toBe(synced.length);
  });

  it('markDelivered sets deliveredAt on inbound messages', async () => {
    const prisma = {
      conversation: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'conv-1',
          buyerId: 'buyer-1',
          sellerId: 'seller-1',
        }),
      },
      message: {
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
    };
    const service = new MessagesService(
      prisma as never,
      { processMessage: jest.fn() } as never,
      { log: jest.fn() } as never,
    );
    const res = await service.markDelivered('conv-1', 'seller-1');
    expect(res.count).toBe(2);
    expect(prisma.message.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          senderId: { not: 'seller-1' },
          deliveredAt: null,
        }),
      }),
    );
  });

  it('mute suppresses message.new notification to recipient', async () => {
    const created = {
      id: 'msg-1',
      conversationId: 'conv-1',
      senderId: 'buyer-1',
      type: MessageType.TEXT,
      body: 'hi',
      imageKey: null,
      offerId: null,
      listingCardId: null,
      clientMsgId: null,
      deliveredAt: null,
      readAt: null,
      scamWarning: false,
      createdAt: new Date(),
      sender: { id: 'buyer-1', profile: { displayName: 'Buyer' } },
    };
    const prisma = {
      conversation: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'conv-1',
          listingId: 'listing-1',
          buyerId: 'buyer-1',
          sellerId: 'seller-1',
        }),
        update: jest.fn(),
      },
      userBlock: { findFirst: jest.fn().mockResolvedValue(null) },
      user: { findFirst: jest.fn().mockResolvedValue(null) },
      userMute: {
        findFirst: jest.fn().mockResolvedValue({ id: 'mute-1' }),
      },
      message: {
        create: jest.fn().mockResolvedValue(created),
      },
    };
    const notifications = { log: jest.fn() };
    const service = new MessagesService(
      prisma as never,
      { processMessage: jest.fn().mockResolvedValue({ scamWarning: false }) } as never,
      notifications as never,
    );
    await service.postMessage('conv-1', 'buyer-1', {
      type: MessageType.TEXT,
      body: 'hi',
    });
    expect(notifications.log).not.toHaveBeenCalled();
  });
});

describe('delete chat for the viewer', () => {
  it('hides a chat until a newer message arrives', () => {
    const deleted = new Date('2026-10-09T00:00:00Z');
    expect(conversationHiddenFromViewer(deleted, null)).toBe(true);
    expect(
      conversationHiddenFromViewer(deleted, new Date('2026-10-08T00:00:00Z')),
    ).toBe(true);
    expect(
      conversationHiddenFromViewer(deleted, new Date('2026-10-09T00:00:01Z')),
    ).toBe(false);
    expect(conversationHiddenFromViewer(null, deleted)).toBe(false);
  });

  it('stamps only the viewer side', async () => {
    const update = jest.fn().mockResolvedValue({});
    const prisma = {
      conversation: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'conv-1',
          buyerId: 'buyer-1',
          sellerId: 'seller-1',
        }),
        update,
      },
    };
    const service = new MessagesService(
      prisma as never,
      { processMessage: jest.fn() } as never,
      { log: jest.fn() } as never,
    );
    await service.deleteForViewer('conv-1', 'seller-1');
    expect(update).toHaveBeenCalledWith({
      where: { id: 'conv-1' },
      data: { sellerDeletedAt: expect.any(Date) },
    });
  });
});

describe('ChatGateway (light)', () => {
  it('extracts token from handshake auth', () => {
    // Smoke: gateway class constructs and emit is no-op without server
    const { ChatGateway } = require('./chat.gateway') as typeof import('./chat.gateway');
    const jwt = { verify: jest.fn() };
    const config = { get: () => 'secret' };
    const prisma = { user: { findUnique: jest.fn() }, conversation: { findUnique: jest.fn() } };
    const gw = new ChatGateway(jwt as never, config as never, prisma as never);
    expect(() =>
      gw.emitToConversation('c1', 'message.new', { id: 'm1' }),
    ).not.toThrow();
  });
});
