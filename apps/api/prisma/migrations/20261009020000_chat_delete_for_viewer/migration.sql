-- Viewer-only chat removal. The other participant keeps the conversation.
ALTER TABLE "conversations" ADD COLUMN "buyerDeletedAt" TIMESTAMP(3),
ADD COLUMN "sellerDeletedAt" TIMESTAMP(3);
