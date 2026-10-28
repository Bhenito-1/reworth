import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
} from '@nestjs/common';
import { RegionConfigService } from './region-config.service';

@Controller('regions')
export class RegionController {
  constructor(private readonly regions: RegionConfigService) {}

  /**
   * Consumer picker: pilot cities only (SW + Abuja + PH).
   * Pass `?all=1` for ops / full config set (excludes disabled).
   */
  @Get()
  list(@Query('all') all?: string) {
    const includeAll = all === '1' || all === 'true';
    return {
      items: this.regions.listCities({ all: includeAll }),
      pilot: [...this.regions.pilotCityKeys()],
    };
  }

  /**
   * ADR-011 Phase A — snap device GPS to nearest community centroid.
   * Does not store or return a public street address.
   */
  @Get('locate')
  locate(@Query('lat') latRaw?: string, @Query('lng') lngRaw?: string) {
    const lat = Number(latRaw);
    const lng = Number(lngRaw);
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      throw new BadRequestException('lat and lng query params required');
    }
    const hit = this.regions.nearestFromLatLng(lat, lng);
    if (!hit) {
      return { found: false, lat, lng };
    }
    return {
      found: true,
      city: hit.city,
      key: hit.city,
      displayName: hit.displayName,
      community: hit.community,
      communityLabel: hit.label,
      geoLat: hit.geoLat,
      geoLng: hit.geoLng,
      distanceKm: Math.round(hit.distanceKm * 100) / 100,
    };
  }

  @Get(':city')
  getOne(@Param('city') city: string) {
    const cfg = this.regions.getCity(city);
    if (!cfg) {
      return { city, found: false };
    }
    return {
      city: cfg.city,
      key: cfg.city,
      displayName: cfg.displayName,
      timezone: cfg.timezone,
      communities: cfg.communities,
      areas: this.regions.listAreas(cfg.city),
      logistics: cfg.logistics,
      pspEnabled: cfg.psp.enabled,
      status: cfg.status ?? 'supply',
    };
  }
}
