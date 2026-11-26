import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { GeocodeAddressDto } from './dto/geocode-address.dto';
import { RoutingService } from './routing.service';

@Controller('routing')
@UseGuards(JwtAuthGuard)
export class RoutingController {
  constructor(private readonly routing: RoutingService) {}

  /** Preview geocode for checkout (does not save). */
  @Post('geocode')
  async geocode(@Body() dto: GeocodeAddressDto) {
    const focus =
      dto.focusLat != null && dto.focusLng != null
        ? { lat: dto.focusLat, lng: dto.focusLng }
        : undefined;
    const hit = await this.routing.geocodeAddress(
      {
        line1: dto.line1,
        line2: dto.line2,
        city: dto.city,
        community: dto.community,
        country: dto.country,
      },
      focus,
    );
    if (!hit) {
      return { ok: false as const, message: 'Could not locate that address' };
    }
    return {
      ok: true as const,
      lat: hit.lat,
      lng: hit.lng,
      source: hit.source,
      label: hit.label,
    };
  }
}
