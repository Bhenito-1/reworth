import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  CurrentUser,
  type AuthUser,
} from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import {
  ListNotificationsQueryDto,
  PatchPreferencesDto,
  RegisterPushTokenDto,
} from './dto/notifications.dto';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  list(
    @CurrentUser() user: AuthUser,
    @Query() query: ListNotificationsQueryDto,
  ) {
    const unread =
      query.unread === 'true'
        ? true
        : query.unread === 'false'
          ? false
          : undefined;
    return this.notifications.list(user.id, {
      category: query.category,
      unread,
    });
  }

  @Get('unread-count')
  @Header('Cache-Control', 'private, no-store')
  unreadCount(@CurrentUser() user: AuthUser) {
    return this.notifications.unreadCount(user.id);
  }

  @Get('preferences')
  getPreferences(@CurrentUser() user: AuthUser) {
    return this.notifications.getPreferences(user.id);
  }

  @Post('preferences/essential-only')
  essentialOnly(@CurrentUser() user: AuthUser) {
    return this.notifications.disableNonEssential(user.id);
  }

  @Patch('preferences')
  patchPreference(
    @CurrentUser() user: AuthUser,
    @Body() dto: PatchPreferencesDto,
  ) {
    return this.notifications.setPreference(
      user.id,
      dto.category,
      dto.channel,
      dto.enabled,
    );
  }

  @Post('read-all')
  markAllRead(@CurrentUser() user: AuthUser) {
    return this.notifications.markAllRead(user.id);
  }

  @Delete()
  clear(@CurrentUser() user: AuthUser) {
    return this.notifications.clearInbox(user.id);
  }

  @Post(':id/read')
  markRead(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.notifications.markRead(user.id, id);
  }
}

@Controller('devices')
@UseGuards(JwtAuthGuard)
export class DevicesController {
  constructor(private readonly notifications: NotificationsService) {}

  @Post('push-token')
  register(
    @CurrentUser() user: AuthUser,
    @Body() dto: RegisterPushTokenDto,
  ) {
    return this.notifications.registerPushToken(
      user.id,
      dto.token,
      dto.platform,
    );
  }
}
