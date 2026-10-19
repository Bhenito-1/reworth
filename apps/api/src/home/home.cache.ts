import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

type CacheEntry = { value: string; expiresAt: number };

/** Redis home-rail cache with in-memory fallback. */
@Injectable()
export class HomeCache implements OnModuleDestroy {
  private readonly logger = new Logger(HomeCache.name);
  private redis: Redis | null = null;
  private readonly memory = new Map<string, CacheEntry>();
  private readonly ttlSeconds: number;

  constructor(config: ConfigService) {
    this.ttlSeconds = Number(
      config.get<string>('HOME_CACHE_TTL_SECONDS') ?? '45',
    );
    const url = config.get<string>('REDIS_URL');
    if (url && process.env.NODE_ENV !== 'test') {
      try {
        const client = new Redis(url, {
          maxRetriesPerRequest: 1,
          lazyConnect: true,
          enableOfflineQueue: false,
          retryStrategy: () => null,
        });
        client.on('error', (err: Error) => {
          this.logger.warn(`Redis error (memory fallback): ${err.message}`);
          this.redis = null;
        });
        client
          .connect()
          .then(() => {
            this.redis = client;
          })
          .catch((err: Error) => {
            this.logger.warn(
              `Redis unavailable, using memory cache: ${err.message}`,
            );
            client.disconnect(false);
            this.redis = null;
          });
      } catch (err) {
        this.logger.warn(`Redis init failed: ${(err as Error).message}`);
        this.redis = null;
      }
    }
  }

  async onModuleDestroy() {
    if (this.redis) {
      await this.redis.quit().catch(() => undefined);
    }
  }

  buildKey(community: string, radiusKm: number | string, grid: string): string {
    return `home:${community || 'all'}:${radiusKm}:${grid}`;
  }

  gridCell(lat?: number, lng?: number): string {
    if (lat == null || lng == null) return 'nogeo';
    // ~1.1km grid
    return `${lat.toFixed(2)}_${lng.toFixed(2)}`;
  }

  async get<T>(key: string): Promise<T | null> {
    if (this.redis) {
      try {
        const raw = await this.redis.get(key);
        if (raw) return JSON.parse(raw) as T;
      } catch {
        // fall through to memory
      }
    }
    const entry = this.memory.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.memory.delete(key);
      return null;
    }
    return JSON.parse(entry.value) as T;
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    const ttl = ttlSeconds ?? this.ttlSeconds;
    const raw = JSON.stringify(value);
    if (this.redis) {
      try {
        await this.redis.set(key, raw, 'EX', ttl);
      } catch {
        // memory fallback
      }
    }
    this.memory.set(key, {
      value: raw,
      expiresAt: Date.now() + ttl * 1000,
    });
  }

  /** Drop cached home rails so a suspension is visible immediately. */
  async clear(): Promise<void> {
    this.memory.clear();
    if (!this.redis) return;
    try {
      const keys = await this.redis.keys('home:*');
      if (keys.length > 0) await this.redis.del(...keys);
    } catch {
      // The next read rebuilds from the database.
    }
  }
}
