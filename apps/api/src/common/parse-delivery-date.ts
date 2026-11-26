import { BadRequestException } from '@nestjs/common';

/** Parses buyer/seller proposed delivery or meetup date (ISO date or datetime). */
export function parseProposedDeliveryDate(iso: string): Date {
  const deliveryDate = new Date(iso);
  if (Number.isNaN(deliveryDate.getTime())) {
    throw new BadRequestException('Delivery date is invalid');
  }
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  if (deliveryDate < startOfToday) {
    throw new BadRequestException('Delivery date must be today or later');
  }
  return deliveryDate;
}