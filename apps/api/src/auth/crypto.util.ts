import { createHash, randomUUID } from 'crypto';
import * as argon2 from 'argon2';

const ARGON2_OPTS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, ARGON2_OPTS);
}

export async function verifyPassword(
  hash: string,
  plain: string,
): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

/** Refresh token / identifier hash: sha256(pepper + value). */
export function hashWithPepper(value: string, pepper: string): string {
  return createHash('sha256').update(`${pepper}:${value}`).digest('hex');
}

export function newFamilyId(): string {
  return randomUUID();
}

export function newRefreshTokenPlain(): string {
  return randomUUID() + randomUUID().replace(/-/g, '');
}

/** Hash identity identifiers — never store raw NIN/BVN/gov ID. */
export function hashIdentifier(raw: string, pepper: string): string {
  return createHash('sha256')
    .update(`id:${pepper}:${raw}`)
    .digest('hex');
}

export function normalizePhone(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits;
  if (digits.startsWith('234')) return `+${digits}`;
  if (digits.startsWith('0') && digits.length === 11) {
    return `+234${digits.slice(1)}`;
  }
  return digits.startsWith('+') ? digits : `+${digits}`;
}

export function parseTtlToMs(ttl: string, fallbackMs: number): number {
  const m = /^(\d+)([smhd])$/i.exec(ttl.trim());
  if (!m) return fallbackMs;
  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  const mult =
    unit === 's' ? 1000 : unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000;
  return n * mult;
}
