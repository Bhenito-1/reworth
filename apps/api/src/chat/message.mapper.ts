import type { Message, MessageType } from '@prisma/client';
import { assertNoPiiFields } from './pii.util';

export type MessageDto = {
  id: string;
  conversationId: string;
  senderId: string;
  type: MessageType;
  body: string | null;
  imageKey: string | null;
  offerId: string | null;
  meetupProposalId: string | null;
  listingCardId: string | null;
  clientMsgId: string | null;
  deliveredAt: Date | null;
  readAt: Date | null;
  scamWarning: boolean;
  createdAt: Date;
  /** Public sender chip — never phone/email. */
  sender?: {
    id: string;
    displayName: string;
  };
};

/**
 * Map Message → DTO. Strips any accidental PII fields.
 * Exported for UI clients / tests.
 */
export function toMessageDto(
  message: Message & {
    sender?: { id: string; profile?: { displayName: string } | null };
  },
): MessageDto {
  const dto: MessageDto = {
    id: message.id,
    conversationId: message.conversationId,
    senderId: message.senderId,
    type: message.type,
    body: message.body,
    imageKey: message.imageKey,
    offerId: message.offerId,
    meetupProposalId: message.meetupProposalId ?? null,
    listingCardId: message.listingCardId,
    clientMsgId: message.clientMsgId,
    deliveredAt: message.deliveredAt,
    readAt: message.readAt,
    scamWarning: message.scamWarning,
    createdAt: message.createdAt,
  };
  if (message.sender) {
    dto.sender = {
      id: message.sender.id,
      displayName: message.sender.profile?.displayName ?? 'User',
    };
  }
  assertNoPiiFields(dto as unknown as Record<string, unknown>);
  return dto;
}
