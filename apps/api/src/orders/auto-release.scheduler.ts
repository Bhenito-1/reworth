import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrdersService } from './orders.service';

@Injectable()
export class AutoReleaseScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AutoReleaseScheduler.name);
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly orders: OrdersService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    const disabled =
      process.env.NODE_ENV === 'test' ||
      this.config.get<string>('ORDER_AUTO_RELEASE_SCHEDULER') === 'false';
    if (disabled) return;

    const intervalMs = 5 * 60 * 1000;
    this.timer = setInterval(() => {
      void this.orders.autoReleaseDue().catch((err) =>
        this.logger.warn(`Auto-release failed: ${(err as Error).message}`),
      );
      // Sellers whose buyer-protection window ended without a dispute.
      void this.orders.releaseAfterCover().catch((err) =>
        this.logger.warn(`Release after cover failed: ${(err as Error).message}`),
      );
      // Seller transfers still PROCESSING: confirm with Paystack.
      void this.orders.reconcileProcessingPayouts().catch((err) =>
        this.logger.warn(`Payout reconcile failed: ${(err as Error).message}`),
      );
      // Unpaid orders past their payment window (ORDER_PAYMENT_WINDOW_HOURS).
      void this.orders.expireUnpaid().catch((err) =>
        this.logger.warn(`Unpaid expiry failed: ${(err as Error).message}`),
      );
    }, intervalMs);
    if (typeof this.timer.unref === 'function') this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
}
