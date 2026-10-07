import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationCategory } from '../notifications/notification-categories';
import {
  matchesSavedFilters,
  savedSearchLabel,
} from './saved-search-matcher';
import { DEFAULT_CITY } from './city-scope';

const DEFAULT_WINDOW_MS = 15 * 60 * 1000;

export function formatSavedSearchAlertBody(
  count: number,
  label: string,
): string {
  if (count === 1) {
    return `1 new ${label} was listed near you`;
  }
  return `${count} new ${label} were listed near you`;
}

@Injectable()
export class SavedSearchAlertsService {
  private readonly logger = new Logger(SavedSearchAlertsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Evaluate non-paused saved searches; batch-notify new matches since
   * lastCheckedAt (or a 15-minute window). Dedupes via SavedSearchAlertDedupe.
   */
  async evaluateActiveSearches(now = new Date()): Promise<{
    searches: number;
    notified: number;
    matches: number;
  }> {
    const searches = await this.prisma.savedSearch.findMany({
      where: { paused: false },
      take: 2_000,
    });

    let notified = 0;
    let matches = 0;

    for (const search of searches) {
      const filters = (search.filters ?? {}) as Record<string, unknown>;
      const since = search.lastCheckedAt
        ? search.lastCheckedAt
        : new Date(now.getTime() - DEFAULT_WINDOW_MS);

      const city =
        typeof filters.city === 'string' && filters.city.trim()
          ? filters.city.trim()
          : DEFAULT_CITY;

      const candidates = await this.prisma.listing.findMany({
        where: {
          status: 'LIVE',
          quantityAvailable: { gt: 0 },
          city,
          OR: [
            { publishedAt: { gte: since } },
            { updatedAt: { gte: since }, status: 'LIVE' },
          ],
        },
        take: 200,
        orderBy: { publishedAt: 'desc' },
      });

      const fresh = candidates.filter((listing) =>
        matchesSavedFilters(
          {
            id: listing.id,
            title: listing.title,
            description: listing.description,
            categoryId: listing.categoryId,
            subcategoryId: listing.subcategoryId,
            priceKobo: listing.priceKobo,
            condition: listing.condition,
            community: listing.community,
            city: listing.city,
            fulfilmentDelivery: listing.fulfilmentDelivery,
            geoLat: listing.geoLat,
            geoLng: listing.geoLng,
            brand: listing.brand,
          },
          filters,
        ),
      );

      const newOnes: typeof fresh = [];
      for (const listing of fresh) {
        const existing = await this.prisma.savedSearchAlertDedupe.findUnique({
          where: {
            savedSearchId_listingId: {
              savedSearchId: search.id,
              listingId: listing.id,
            },
          },
        });
        if (existing) continue;

        try {
          await this.prisma.savedSearchAlertDedupe.create({
            data: {
              id: randomUUID(),
              savedSearchId: search.id,
              listingId: listing.id,
              notifiedAt: now,
            },
          });
          newOnes.push(listing);
        } catch {
          // Unique race — already notified
        }
      }

      matches += newOnes.length;

      await this.prisma.savedSearch.update({
        where: { id: search.id },
        data: {
          lastCheckedAt: now,
          ...(newOnes.length > 0
            ? { newMatchesCount: { increment: newOnes.length } }
            : {}),
        },
      });

      if (newOnes.length === 0) continue;

      const label = savedSearchLabel(search.name, filters);
      const body = formatSavedSearchAlertBody(newOnes.length, label);
      await this.notifications.notify({
        userId: search.userId,
        category: NotificationCategory.SAVED_SEARCH_MATCH,
        title: 'New saved search matches',
        body,
        deepLink: `/favourites/searches/${search.id}`,
        meta: {
          savedSearchId: search.id,
          listingIds: newOnes.map((l) => l.id),
          count: newOnes.length,
        },
      });
      notified += 1;
    }

    if (notified > 0) {
      this.logger.log(
        `Saved-search alerts: ${notified} notify batch(es), ${matches} match(es)`,
      );
    }

    return { searches: searches.length, notified, matches };
  }
}
