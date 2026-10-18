import { z } from 'zod';

/** Zod helpers for API boundary validation (complements class-validator DTOs). */
export function parseOrThrow<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const msg = result.error.issues
      .map((i) => `${i.path.join('.') || 'body'}: ${i.message}`)
      .join('; ');
    throw new Error(`Validation failed: ${msg}`);
  }
  return result.data;
}

export const consentUpdateSchema = z.object({
  channel: z.enum(['MARKETING', 'EMAIL']),
  granted: z.boolean(),
});

export const appealReasonSchema = z.object({
  reason: z.string().trim().min(8).max(2000),
});

export const listingIdSchema = z.string().uuid();
