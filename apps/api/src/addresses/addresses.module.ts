import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RoutingModule } from '../routing/routing.module';
import { AddressesService } from './addresses.service';

@Module({
  imports: [PrismaModule, RoutingModule, AuditModule],
  providers: [AddressesService],
  exports: [AddressesService],
})
export class AddressesModule {}
