import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  type AuthUser,
} from '../common/decorators/current-user.decorator';
import {
  CreateConversationDto,
  MuteConversationDto,
  PostMeetupPinDto,
  PostMessageDto,
  ReportUserDto,
} from './dto/chat.dto';
import { MessagesService } from './messages.service';

/**
 * Chat REST API (polling fallback for sockets).
 *
 * Response shapes (UI helpers):
 * - GET /conversations → ConversationListItem[]
 *   { id, listingId, listingTitle, listingThumb, buyerId, sellerId,
 *     counterpart:{id,displayName}, lastMessageAt, lastMessagePreview,
 *     unreadCount, muted, activeOffer:{id,amountKobo,status}|null, createdAt }
 * - POST /conversations → Conversation { id, listingId, buyerId, sellerId, ... }
 * - GET /conversations/:id/messages → MessageDto[] (also marks delivery)
 *   { id, conversationId, senderId, type, body, imageKey, offerId,
 *     listingCardId, clientMsgId, deliveredAt, readAt, scamWarning, createdAt,
 *     sender?:{id,displayName} } — never phone/email
 * - POST /conversations/:id/messages → MessageDto (clientMsgId deduped)
 * - POST /conversations/:id/read · POST /delivered · POST/DELETE mute
 * - DELETE /conversations/:id → hide the chat for the caller only
 */
@Controller()
@UseGuards(JwtAuthGuard)
export class ConversationsController {
  constructor(private readonly messages: MessagesService) {}

  @Get('conversations')
  list(@CurrentUser() user: AuthUser) {
    return this.messages.listConversations(user.id);
  }

  @Post('conversations')
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateConversationDto,
  ) {
    return this.messages.createOrGetConversation(user.id, dto.listingId);
  }

  @Get('conversations/:id/messages')
  listMessages(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('after') after?: string,
    @Query('limit') limit?: string,
  ) {
    return this.messages.listMessages(id, user.id, {
      after,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post('conversations/:id/messages')
  postMessage(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: PostMessageDto,
  ) {
    return this.messages.postMessage(id, user.id, dto);
  }

  /** ADR-011 Phase C — private meetup pin (participants only). */
  @Post('conversations/:id/meetup-pin')
  postMeetupPin(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: PostMeetupPinDto,
  ) {
    return this.messages.postMeetupPin(id, user.id, dto);
  }

  @Post('conversations/:id/read')
  markRead(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { messageIds?: string[] },
  ) {
    return this.messages.markRead(id, user.id, body?.messageIds);
  }

  @Post('conversations/:id/delivered')
  markDelivered(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { messageIds?: string[] },
  ) {
    return this.messages.markDelivered(id, user.id, body?.messageIds);
  }

  @Post('conversations/:id/mute')
  mute(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: MuteConversationDto,
  ) {
    return this.messages.muteConversation(id, user.id, dto.mutedId);
  }

  @Delete('conversations/:id/mute')
  unmute(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.messages.unmuteConversation(id, user.id);
  }

  @Delete('conversations/:id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.messages.deleteForViewer(id, user.id);
  }

  @Post('users/:id/block')
  block(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.messages.blockUser(user.id, id);
  }

  @Delete('users/:id/block')
  unblock(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.messages.unblockUser(user.id, id);
  }

  @Post('users/:id/report')
  report(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ReportUserDto,
  ) {
    return this.messages.reportUser(user.id, id, dto);
  }
}
