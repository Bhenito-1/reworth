import { createHmac, timingSafeEqual } from 'crypto';
import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  computeDeliveryFeeKobo,
  DEFAULT_DELIVERY_RATES,
  type CreateShipmentInput,
  type CreateShipmentResult,
  type DeliveryProvider,
  type DeliveryQuoteInput,
  type DeliveryQuoteResult,
  type UpdateShipmentStatusInput,
} from './delivery.provider';
import { haversineKm } from './search.provider';
import { RegionConfigService } from '../region/region-config.service';

export type PartnerDeliveryConfig = {
  /** Base URL for partner logistics API (no trailing slash). */
  apiUrl: string;
  apiKey: string;
  /**
   * dry-run: log + local refs, no HTTP (safe for staging without live partner).
   * live: POST create/status to partner API.
   */
  mode: 'dry-run' | 'live';
  webhookSecret?: string;
};

/**
 * Production-shaped courier adapter (GIG / Kwik / Fez-class).
 * Quote stays region-config based (ADR-008) unless partner quote endpoint is added later.
 */
@Injectable()
export class PartnerDeliveryProvider implements DeliveryProvider {
  readonly name = 'partner-delivery';
  private readonly logger = new Logger(PartnerDeliveryProvider.name);
  private readonly cfg: PartnerDeliveryConfig;

  constructor(
    cfg: PartnerDeliveryConfig,
    @Optional() private readonly regions?: RegionConfigService,
  ) {
    this.cfg = cfg;
  }

  static fromEnv(regions?: RegionConfigService): PartnerDeliveryProvider {
    const modeRaw = (
      process.env.DELIVERY_PARTNER_MODE ?? 'dry-run'
    ).toLowerCase();
    const mode: 'dry-run' | 'live' = modeRaw === 'live' ? 'live' : 'dry-run';
    const apiUrl = (process.env.DELIVERY_PARTNER_API_URL ?? '').replace(
      /\/$/,
      '',
    );
    const apiKey = process.env.DELIVERY_PARTNER_API_KEY ?? '';
    if (mode === 'live' && (!apiUrl || !apiKey)) {
      throw new Error(
        'PartnerDeliveryProvider live mode requires DELIVERY_PARTNER_API_URL and DELIVERY_PARTNER_API_KEY; use DELIVERY_PARTNER_MODE=dry-run or DELIVERY_PROVIDER=mock',
      );
    }
    return new PartnerDeliveryProvider(
      {
        apiUrl,
        apiKey,
        mode,
        webhookSecret: process.env.DELIVERY_WEBHOOK_SECRET || undefined,
      },
      regions,
    );
  }

  async quote(input: DeliveryQuoteInput): Promise<DeliveryQuoteResult> {
    const distanceKm = haversineKm(
      input.fromLat,
      input.fromLng,
      input.toLat,
      input.toLng,
    );
    const rates = this.regions
      ? this.regions.getDeliveryRates(input.city)
      : DEFAULT_DELIVERY_RATES;
    const feeKobo = computeDeliveryFeeKobo(distanceKm, rates);
    return {
      feeKobo,
      distanceKm: Math.round(distanceKm * 100) / 100,
      provider: this.name,
    };
  }

  async createShipment(
    input: CreateShipmentInput,
  ): Promise<CreateShipmentResult> {
    // Honest next-day window (delivery-journey sprint decision)
    const start = new Date();
    start.setHours(start.getHours() + 18);
    const end = new Date(start.getTime() + 8 * 60 * 60 * 1000);

    if (this.cfg.mode === 'dry-run') {
      const providerRef = `partner_dry_${input.orderId.replace(/-/g, '').slice(0, 12)}_${Date.now()}`;
      this.logger.log({
        event: 'partner.shipment.dry_run',
        providerRef,
        orderId: input.orderId,
        quoteKobo: input.quoteKobo,
      });
      return {
        providerRef,
        status: 'ASSIGNED',
        etaFrom: start,
        etaTo: end,
      };
    }

    const res = await fetch(`${this.cfg.apiUrl}/v1/shipments`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.cfg.apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': input.orderId,
      },
      body: JSON.stringify({
        externalOrderId: input.orderId,
        quoteKobo: input.quoteKobo,
        distanceKm: input.distanceKm,
        pickup: { lat: input.fromLat, lng: input.fromLng },
        dropoff: { lat: input.toLat, lng: input.toLng },
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `Partner createShipment failed: ${res.status} ${text.slice(0, 400)}`,
      );
    }
    const json = (await res.json()) as {
      trackingId?: string;
      id?: string;
      etaFrom?: string;
      etaTo?: string;
    };
    const providerRef = json.trackingId ?? json.id;
    if (!providerRef) {
      throw new Error('Partner createShipment missing trackingId');
    }
    return {
      providerRef,
      status: 'ASSIGNED',
      etaFrom: json.etaFrom ? new Date(json.etaFrom) : start,
      etaTo: json.etaTo ? new Date(json.etaTo) : end,
    };
  }

  async updateStatus(input: UpdateShipmentStatusInput): Promise<void> {
    if (this.cfg.mode === 'dry-run') {
      this.logger.log({
        event: 'partner.shipment.status.dry_run',
        ...input,
      });
      return;
    }
    const res = await fetch(
      `${this.cfg.apiUrl}/v1/shipments/${encodeURIComponent(input.providerRef)}/status`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.cfg.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: input.status,
          failureReason: input.failureReason,
        }),
      },
    );
    if (!res.ok) {
      const text = await res.text();
      this.logger.warn({
        event: 'partner.shipment.status.failed',
        status: res.status,
        body: text.slice(0, 200),
      });
    }
  }

  /** HMAC-SHA256 hex of raw body; header `x-reworth-delivery-signature`. */
  verifyWebhookSignature(rawBody: string, signature: string | undefined): boolean {
    return PartnerDeliveryProvider.verifyWebhookSignature(
      rawBody,
      signature,
      this.cfg.webhookSecret,
    );
  }

  /**
   * Verify partner webhook. Empty secret = open (local/mock compatible).
   */
  static verifyWebhookSignature(
    rawBody: string,
    signature: string | undefined,
    secret: string | undefined = process.env.DELIVERY_WEBHOOK_SECRET,
  ): boolean {
    if (!secret) return true;
    if (!signature) return false;
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(signature.trim());
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
