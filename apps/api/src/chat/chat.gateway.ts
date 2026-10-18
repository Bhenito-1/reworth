import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import type { AccessTokenPayload } from '../auth/jwt.strategy';

type AuthedSocket = Socket & { data: { userId?: string } };

/**
 * Socket namespace `/chat`.
 * Auth: JWT from handshake.auth.token or Authorization Bearer.
 * Events: message.new, message.read, typing, offer.updated
 */
@WebSocketGateway({
  namespace: '/chat',
  cors: { origin: true, credentials: true },
})
export class ChatGateway implements OnGatewayConnection {
  private readonly logger = new Logger(ChatGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(client: AuthedSocket) {
    try {
      const token = this.extractToken(client);
      if (!token) {
        client.disconnect(true);
        return;
      }
      const payload = this.jwt.verify<AccessTokenPayload>(token, {
        secret:
          this.config.get<string>('JWT_ACCESS_SECRET') ?? 'dev-access-secret',
      });
      if (payload.typ !== 'access' || !payload.sub) {
        client.disconnect(true);
        return;
      }
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });
      if (!user || user.status !== 'ACTIVE') {
        client.disconnect(true);
        return;
      }
      client.data.userId = user.id;
      await client.join(`user:${user.id}`);
    } catch (err) {
      this.logger.debug(`WS auth failed: ${(err as Error).message}`);
      client.disconnect(true);
    }
  }

  private extractToken(client: Socket): string | null {
    const auth = client.handshake.auth as { token?: string };
    if (auth?.token) return auth.token;
    const header = client.handshake.headers.authorization;
    if (header?.startsWith('Bearer ')) return header.slice(7);
    const q = client.handshake.query.token;
    if (typeof q === 'string') return q;
    return null;
  }

  @SubscribeMessage('conversation.join')
  async joinConversation(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { conversationId: string },
  ) {
    const userId = client.data.userId;
    if (!userId || !body?.conversationId) return { ok: false };
    const c = await this.prisma.conversation.findUnique({
      where: { id: body.conversationId },
    });
    if (!c || (c.buyerId !== userId && c.sellerId !== userId)) {
      return { ok: false };
    }
    const suspended = await this.prisma.user.findFirst({
      where: {
        id: { in: [c.buyerId, c.sellerId] },
        status: 'SUSPENDED',
      },
      select: { id: true },
    });
    if (suspended) return { ok: false };
    await client.join(`conversation:${body.conversationId}`);
    return { ok: true };
  }

  @SubscribeMessage('typing')
  async typing(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { conversationId: string; isTyping?: boolean },
  ) {
    const userId = client.data.userId;
    if (!userId || !body?.conversationId) return;
    this.emitToConversation(body.conversationId, 'typing', {
      conversationId: body.conversationId,
      userId,
      isTyping: body.isTyping !== false,
    });
  }

  emitToConversation(conversationId: string, event: string, payload: unknown) {
    if (!this.server) return;
    this.server
      .to(`conversation:${conversationId}`)
      .emit(event, payload);
  }

  /** Lightweight inbox hint for people already connected. No database read. */
  emitToUsers(userIds: string[], event: string, payload: unknown) {
    if (!this.server) return;
    for (const userId of userIds) {
      this.server.to(`user:${userId}`).emit(event, payload);
    }
  }

  emitOfferUpdated(conversationId: string | null | undefined, payload: unknown) {
    if (conversationId) {
      this.emitToConversation(conversationId, 'offer.updated', payload);
    }
  }
}
