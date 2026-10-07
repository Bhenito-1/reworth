import { Controller, Get, Param, Query } from '@nestjs/common';
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
