import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Requires JwtAuthGuard first. Allows only active users flagged as delivery drivers.
 */
@Injectable()
export class DeliveryDriverGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    const user = request.user;
    if (!user?.id) {
      throw new ForbiddenException('Authentication required');
    }

    const row = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { isDeliveryDriver: true, status: true, deletedAt: true },
    });
    if (!row || row.deletedAt || row.status !== 'ACTIVE') {
      throw new ForbiddenException('Driver account inactive');
    }
    if (!row.isDeliveryDriver) {
      throw new ForbiddenException('Not a delivery driver');
    }
    return true;
  }
}
