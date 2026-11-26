import { BadRequestException } from '@nestjs/common';
import { FulfilmentMethod } from '@prisma/client';
import {
  isPlatformDeliveryCheckoutAllowed,
  PLATFORM_DELIVERY_UNAVAILABLE_MESSAGE,
} from '@reworth/shared';

export function assertPlatformDeliveryCheckoutAllowed(
  fulfilmentMethod: FulfilmentMethod,
): void {
  if (!isPlatformDeliveryCheckoutAllowed(fulfilmentMethod)) {
    throw new BadRequestException(PLATFORM_DELIVERY_UNAVAILABLE_MESSAGE);
  }
}