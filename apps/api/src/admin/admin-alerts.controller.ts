import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AdminRole } from '@prisma/client';
import {
  CurrentUser,
  type AuthUser,
} from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminOnlyGuard } from '../common/guards/admin-only.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AdminAlertsService } from './admin-alerts.service';

const ANY_ADMIN = Object.values(AdminRole);

@Controller('admin/alerts')
@UseGuards(JwtAuthGuard, RolesGuard, AdminOnlyGuard)
export class AdminAlertsController {
  constructor(private readonly alerts: AdminAlertsService) {}

  @Get()
  @Roles(...ANY_ADMIN)
  list(@CurrentUser() actor: AuthUser) {
    return this.alerts.listFor(actor.id);
  }

  @Post('read-all')
  @Roles(...ANY_ADMIN)
  markAllRead(@CurrentUser() actor: AuthUser) {
    return this.alerts.markAllRead(actor.id);
  }

  @Post(':id/read')
  @Roles(...ANY_ADMIN)
  markRead(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    return this.alerts.markRead(actor.id, id);
  }
}
