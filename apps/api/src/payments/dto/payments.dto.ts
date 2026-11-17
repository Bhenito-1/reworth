import { IsString, IsUUID, MinLength } from 'class-validator';

export class InitiatePaymentDto {
  @IsUUID()
  orderId!: string;

  @IsString()
  @MinLength(8)
  idempotencyKey!: string;
}

/** Buyer return from Paystack (`reference` or `trxref` on the callback URL). */
export class ConfirmPaymentDto {
  @IsString()
  @MinLength(6)
  reference!: string;
}
