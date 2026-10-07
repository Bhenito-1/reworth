import { Controller, Get, Param } from '@nestjs/common';
import { RegionConfigService } from './region-config.service';

@Controller('regions')
export class RegionController {
  constructor(private readonly regions: RegionConfigService) {}

  @Get()
  list() {
    return { items: this.regions.listCities() };
  }

  @Get(':city')
  getOne(@Param('city') city: string) {
    const cfg = this.regions.getCity(city);
    if (!cfg) {
      return { city, found: false };
    }
    return {
      city: cfg.city,
      displayName: cfg.displayName,
      timezone: cfg.timezone,
      communities: cfg.communities,
      areas: this.regions.listAreas(cfg.city),
      logistics: cfg.logistics,
      pspEnabled: cfg.psp.enabled,
    };
  }
}
