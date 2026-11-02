import { Body, Controller, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { SupportRequestDto } from './dto/support-request.dto';
import { SupportService } from './support.service';

@Controller('support')
@Throttle({ default: { limit: 5, ttl: 60_000 } })
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Post()
  submit(@Body() dto: SupportRequestDto) {
    return this.support.submit(dto);
  }
}
