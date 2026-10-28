import { Body, Controller, Param, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import {
  LoginDto,
  LogoutDto,
  OAuthCallbackDto,
  RefreshDto,
  RegisterDto,
} from './dto/auth.dto';

@Controller('auth')
@Throttle({ auth: { limit: 20, ttl: 60_000 } })
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto, @Req() req: { ip?: string }) {
    return this.auth.register(dto, req.ip);
  }

  @Post('login')
  login(@Body() dto: LoginDto, @Req() req: { ip?: string }) {
    return this.auth.login(dto, req.ip);
  }

  @Post('refresh')
  refresh(@Body() dto: RefreshDto, @Req() req: { ip?: string }) {
    return this.auth.refresh(dto.refreshToken, req.ip);
  }

  @Post('logout')
  logout(@Body() dto: LogoutDto, @Req() req: { ip?: string }) {
    return this.auth.logout(dto.refreshToken, undefined, req.ip);
  }

  @Post('oauth/:provider/callback')
  oauth(
    @Param('provider') provider: string,
    @Body() dto: OAuthCallbackDto,
    @Req() req: { ip?: string },
  ) {
    return this.auth.oauthCallback(provider, dto, req.ip);
  }
}
