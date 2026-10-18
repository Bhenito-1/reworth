import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ChatScanKind } from '@prisma/client';
import type { Response } from 'express';
import {
  CurrentUser,
  type AuthUser,
} from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminOnlyGuard } from '../common/guards/admin-only.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AdminDashboardService } from './admin-dashboard.service';
import { AdminPortalService } from './admin-portal.service';
import {
  ANALYTICS,
  AUDIT,
  CATALOG,
  DASHBOARD,
  DISPUTES,
  FINANCE,
  FRAUD,
  LISTINGS_MOD,
  OPS,
  ORDERS_READ,
  PROMOTIONS,
  REPORTS,
  SUPPORT,
  USERS_READ,
  USERS_WRITE,
  VERIFICATIONS,
} from './admin-roles';
import {
  AdminCategoryDto,
  AdminChatScanRuleDto,
  AdminCommunityDto,
  AdminAddCommunityManagerDto,
  AdminPatchCommunityDto,
  AdminAppealResolveDto,
  AdminExtendExpiryDto,
  AdminFeatureListingDto,
  AdminHeroBannerDto,
  AdminMeetPointDto,
  AdminPromotionCreateDto,
  AdminRefundDto,
  AdminApproveListingDto,
  AdminFlagListingDto,
  AdminRejectListingDto,
  AdminRejectVerificationDto,
  AdminReportActionDto,
  AdminSuspendDto,
  AdminUnsuspendDto,
  AdminSupportNoteDto,
  AdminSupportPatchDto,
  AdminSupportRespondDto,
  AdminWhitelistDto,
} from './dto/admin-ops.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard, AdminOnlyGuard)
export class AdminPortalController {
  constructor(
    private readonly dashboard: AdminDashboardService,
    private readonly portal: AdminPortalService,
  ) {}

  // ── Dashboard ──────────────────────────────────────────────────────

  @Get('dashboard/kpis')
  @Roles(...DASHBOARD)
  kpis(@Query('days') days?: string) {
    return this.dashboard.kpis(days ? Number(days) : 30);
  }

  // ── Users (list / actions) ─────────────────────────────────────────

  @Post('users/:id/suspend')
  @Roles(...USERS_WRITE)
  suspend(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: AdminSuspendDto,
    @Req() req: { ip?: string },
  ) {
    return this.portal.suspendUser(actor, id, dto.reason, req.ip);
  }

  @Post('users/:id/unsuspend')
  @Roles(...USERS_WRITE)
  unsuspend(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: AdminUnsuspendDto,
    @Req() req: { ip?: string },
  ) {
    return this.portal.unsuspendUser(actor, id, dto.reason, req.ip);
  }

  @Post('users/:id/reset-verification')
  @Roles(...VERIFICATIONS)
  resetVerification(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Req() req: { ip?: string },
  ) {
    return this.portal.resetVerification(actor, id, req.ip);
  }

  @Post('users/:id/whitelist')
  @Roles(...FRAUD)
  whitelist(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: AdminWhitelistDto,
    @Req() req: { ip?: string },
  ) {
    return this.portal.whitelistUser(actor, id, dto, req.ip);
  }

  // ── Listings ───────────────────────────────────────────────────────

  @Get('listings')
  @Roles(...LISTINGS_MOD, ...USERS_READ)
  listListings(
    @Query('status') status?: string,
    @Query('flag') flag?: string,
  ) {
    return this.portal.listListings(status, flag);
  }

  @Get('listings/:id')
  @Roles(...LISTINGS_MOD, ...USERS_READ)
  getListing(@Param('id') id: string) {
    return this.portal.getListingDetail(id);
  }

  @Post('listings/:id/approve')
  @Roles(...LISTINGS_MOD)
  approveListing(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: AdminApproveListingDto,
    @Req() req: { ip?: string },
  ) {
    return this.portal.approveListing(actor, id, dto, req.ip);
  }

  @Post('listings/:id/reject')
  @Roles(...LISTINGS_MOD)
  rejectListing(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: AdminRejectListingDto,
    @Req() req: { ip?: string },
  ) {
    return this.portal.rejectListing(actor, id, dto, req.ip);
  }

  @Post('listings/:id/remove')
  @Roles(...LISTINGS_MOD, ...FRAUD)
  removeListing(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Req() req: { ip?: string },
  ) {
    return this.portal.removeListing(actor, id, req.ip);
  }

  @Post('listings/:id/flag')
  @Roles(...LISTINGS_MOD, ...FRAUD)
  flagListing(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: AdminFlagListingDto,
    @Req() req: { ip?: string },
  ) {
    return this.portal.flagListing(actor, id, dto, req.ip);
  }

  @Post('listings/:id/feature')
  @Roles(...PROMOTIONS)
  featureListing(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: AdminFeatureListingDto,
    @Req() req: { ip?: string },
  ) {
    return this.portal.featureListing(actor, id, dto, req.ip);
  }

  @Post('listings/:id/extend-expiry')
  @Roles(...LISTINGS_MOD)
  extendExpiry(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: AdminExtendExpiryDto,
    @Req() req: { ip?: string },
  ) {
    return this.portal.extendExpiry(actor, id, dto, req.ip);
  }

  // ── Orders ─────────────────────────────────────────────────────────

  @Get('orders')
  @Roles(...ORDERS_READ)
  listOrders() {
    return this.portal.listOrders();
  }

  @Get('orders/:id')
  @Roles(...ORDERS_READ)
  getOrder(@Param('id') id: string) {
    return this.portal.getOrder(id);
  }

  @Post('orders/:id/refund')
  @Roles(...FINANCE)
  refundOrder(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: AdminRefundDto,
    @Req() req: { ip?: string },
  ) {
    return this.portal.refundOrder(actor, id, dto, req.ip);
  }

  // ── Disputes ───────────────────────────────────────────────────────

  @Get('disputes')
  @Roles(...DISPUTES)
  listDisputes(@Query('status') status?: string) {
    return this.portal.listDisputes(status);
  }

  // ── Verifications ──────────────────────────────────────────────────

  @Get('verifications')
  @Roles(...VERIFICATIONS)
  listVerifications(@Query('status') status?: string) {
    return this.portal.listVerifications(status ?? 'PENDING');
  }

  @Post('verifications/:id/approve')
  @Roles(...VERIFICATIONS)
  approveVerification(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Req() req: { ip?: string },
  ) {
    return this.portal.approveVerification(actor, id, req.ip);
  }

  @Post('verifications/:id/reject')
  @Roles(...VERIFICATIONS)
  rejectVerification(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: AdminRejectVerificationDto,
    @Req() req: { ip?: string },
  ) {
    return this.portal.rejectVerification(actor, id, dto, req.ip);
  }

  // ── Reports ────────────────────────────────────────────────────────

  @Get('reports')
  @Roles(...REPORTS)
  listReports() {
    return this.portal.listReports();
  }

  @Post('reports/:id/dismiss')
  @Roles(...REPORTS)
  dismissReport(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Req() req: { ip?: string },
  ) {
    return this.portal.dismissReport(actor, id, req.ip);
  }

  @Post('reports/:id/action')
  @Roles(...REPORTS)
  actionReport(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: AdminReportActionDto,
    @Req() req: { ip?: string },
  ) {
    return this.portal.actionReport(actor, id, dto, req.ip);
  }

  // ── Fraud ──────────────────────────────────────────────────────────

  @Get('risk-events')
  @Roles(...FRAUD)
  listRiskEvents() {
    return this.portal.listRiskEvents();
  }

  @Post('risk-events/:id/review')
  @Roles(...FRAUD)
  reviewRisk(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Req() req: { ip?: string },
  ) {
    return this.portal.reviewRiskEvent(actor, id, req.ip);
  }

  @Get('appeals')
  @Roles(...LISTINGS_MOD)
  listAppeals() {
    return this.portal.listAppeals();
  }

  @Post('appeals/:id/resolve')
  @Roles(...LISTINGS_MOD)
  resolveAppeal(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: AdminAppealResolveDto,
    @Req() req: { ip?: string },
  ) {
    return this.portal.resolveAppeal(actor, id, dto, req.ip);
  }

  // ── Support ────────────────────────────────────────────────────────

  @Get('support-tickets')
  @Roles(...SUPPORT)
  listTickets() {
    return this.portal.listSupportTickets();
  }

  @Get('support-tickets/:id')
  @Roles(...SUPPORT)
  getTicket(@Param('id') id: string) {
    return this.portal.getSupportTicket(id);
  }

  @Patch('support-tickets/:id')
  @Roles(...SUPPORT)
  patchTicket(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: AdminSupportPatchDto,
    @Req() req: { ip?: string },
  ) {
    return this.portal.patchSupportTicket(actor, id, dto, req.ip);
  }

  @Post('support-tickets/:id/notes')
  @Roles(...SUPPORT)
  addNote(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: AdminSupportNoteDto,
    @Req() req: { ip?: string },
  ) {
    return this.portal.addSupportNote(actor, id, dto, req.ip);
  }

  @Post('support-tickets/:id/respond')
  @Roles(...SUPPORT)
  respond(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: AdminSupportRespondDto,
    @Req() req: { ip?: string },
  ) {
    return this.portal.respondSupport(actor, id, dto, req.ip);
  }

  // ── Catalog ────────────────────────────────────────────────────────

  @Get('categories')
  @Roles(...CATALOG)
  listCategories() {
    return this.portal.listCategories();
  }

  @Post('categories')
  @Roles(...CATALOG)
  createCategory(
    @CurrentUser() actor: AuthUser,
    @Body() dto: AdminCategoryDto,
    @Req() req: { ip?: string },
  ) {
    return this.portal.createCategory(
      actor,
      {
        slug: dto.slug,
        name: dto.name,
        sortOrder: dto.sortOrder ?? 0,
        iconUrl: dto.iconUrl,
        ...(dto.parentId
          ? { parent: { connect: { id: dto.parentId } } }
          : {}),
      },
      req.ip,
    );
  }

  @Put('categories/:id')
  @Roles(...CATALOG)
  updateCategory(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: Partial<AdminCategoryDto>,
    @Req() req: { ip?: string },
  ) {
    return this.portal.updateCategory(
      actor,
      id,
      {
        ...(dto.slug !== undefined ? { slug: dto.slug } : {}),
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.iconUrl !== undefined ? { iconUrl: dto.iconUrl } : {}),
      },
      req.ip,
    );
  }

  @Delete('categories/:id')
  @Roles(...CATALOG)
  deleteCategory(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Req() req: { ip?: string },
  ) {
    return this.portal.deleteCategory(actor, id, req.ip);
  }

  @Get('meet-points')
  @Roles(...CATALOG)
  listMeetPoints() {
    return this.portal.listMeetPoints();
  }

  @Post('meet-points')
  @Roles(...CATALOG)
  createMeetPoint(
    @CurrentUser() actor: AuthUser,
    @Body() dto: AdminMeetPointDto,
    @Req() req: { ip?: string },
  ) {
    return this.portal.createMeetPoint(
      actor,
      {
        community: dto.community,
        name: dto.name,
        landmark: dto.landmark,
        lat: Number(dto.lat),
        lng: Number(dto.lng),
        active: dto.active ?? true,
      },
      req.ip,
    );
  }

  @Put('meet-points/:id')
  @Roles(...CATALOG)
  updateMeetPoint(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: Partial<AdminMeetPointDto>,
    @Req() req: { ip?: string },
  ) {
    return this.portal.updateMeetPoint(actor, id, dto as never, req.ip);
  }

  @Delete('meet-points/:id')
  @Roles(...CATALOG)
  deleteMeetPoint(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Req() req: { ip?: string },
  ) {
    return this.portal.deleteMeetPoint(actor, id, req.ip);
  }

  @Get('chat-scan-rules')
  @Roles(...CATALOG)
  listScanRules() {
    return this.portal.listChatScanRules();
  }

  @Post('chat-scan-rules')
  @Roles(...CATALOG)
  createScanRule(
    @CurrentUser() actor: AuthUser,
    @Body() dto: AdminChatScanRuleDto,
    @Req() req: { ip?: string },
  ) {
    return this.portal.createChatScanRule(
      actor,
      {
        pattern: dto.pattern,
        kind: dto.kind as ChatScanKind,
        enabled: dto.enabled ?? true,
      },
      req.ip,
    );
  }

  @Put('chat-scan-rules/:id')
  @Roles(...CATALOG)
  updateScanRule(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: Partial<AdminChatScanRuleDto>,
    @Req() req: { ip?: string },
  ) {
    return this.portal.updateChatScanRule(
      actor,
      id,
      {
        ...(dto.pattern !== undefined ? { pattern: dto.pattern } : {}),
        ...(dto.kind !== undefined
          ? { kind: dto.kind as ChatScanKind }
          : {}),
        ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
      },
      req.ip,
    );
  }

  @Delete('chat-scan-rules/:id')
  @Roles(...CATALOG)
  deleteScanRule(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Req() req: { ip?: string },
  ) {
    return this.portal.deleteChatScanRule(actor, id, req.ip);
  }

  @Get('hero-banners')
  @Roles(...CATALOG)
  listBanners() {
    return this.portal.listHeroBanners();
  }

  @Post('hero-banners')
  @Roles(...CATALOG, ...PROMOTIONS)
  createBanner(
    @CurrentUser() actor: AuthUser,
    @Body() dto: AdminHeroBannerDto,
    @Req() req: { ip?: string },
  ) {
    return this.portal.createHeroBanner(actor, dto, req.ip);
  }

  @Put('hero-banners/:id')
  @Roles(...CATALOG, ...PROMOTIONS)
  updateBanner(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: Partial<AdminHeroBannerDto>,
    @Req() req: { ip?: string },
  ) {
    return this.portal.updateHeroBanner(actor, id, dto, req.ip);
  }

  @Delete('hero-banners/:id')
  @Roles(...CATALOG, ...PROMOTIONS)
  deleteBanner(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Req() req: { ip?: string },
  ) {
    return this.portal.deleteHeroBanner(actor, id, req.ip);
  }

  @Get('communities')
  @Roles(...CATALOG)
  listCommunities() {
    return this.portal.listCommunities();
  }

  @Post('communities')
  @Roles(...CATALOG)
  createCommunity(
    @CurrentUser() actor: AuthUser,
    @Body() dto: AdminCommunityDto,
    @Req() req: { ip?: string },
  ) {
    return this.portal.createCommunity(actor, dto, req.ip);
  }

  @Patch('communities/:id')
  @Roles(...OPS, ...CATALOG)
  patchCommunity(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: AdminPatchCommunityDto,
    @Req() req: { ip?: string },
  ) {
    return this.portal.patchCommunity(actor, id, dto, req.ip);
  }

  @Get('communities/:id/memberships')
  @Roles(...OPS, ...CATALOG)
  listCommunityMemberships(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Query('status') status?: string,
  ) {
    return this.portal.listCommunityMemberships(actor, id, status);
  }

  @Post('memberships/:id/approve')
  @Roles(...OPS, ...CATALOG)
  approveMembership(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Req() req: { ip?: string },
  ) {
    return this.portal.approveMembership(actor, id, req.ip);
  }

  @Post('memberships/:id/reject')
  @Roles(...OPS, ...CATALOG)
  rejectMembership(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Req() req: { ip?: string },
  ) {
    return this.portal.rejectMembership(actor, id, req.ip);
  }

  @Post('memberships/:id/suspend')
  @Roles(...OPS, ...CATALOG)
  suspendMembership(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Req() req: { ip?: string },
  ) {
    return this.portal.suspendMembership(actor, id, req.ip);
  }

  @Post('communities/:id/managers')
  @Roles(...OPS)
  addManager(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: AdminAddCommunityManagerDto,
    @Req() req: { ip?: string },
  ) {
    return this.portal.addCommunityManager(actor, id, dto.userId, req.ip);
  }

  @Delete('communities/:id/managers/:userId')
  @Roles(...OPS)
  removeManager(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Req() req: { ip?: string },
  ) {
    return this.portal.removeCommunityManager(actor, id, userId, req.ip);
  }

  // ── Promotions ─────────────────────────────────────────────────────

  @Get('promotions')
  @Roles(...PROMOTIONS)
  listPromotions() {
    return this.portal.listPromotions();
  }

  @Post('promotions')
  @Roles(...PROMOTIONS)
  createPromotion(
    @CurrentUser() actor: AuthUser,
    @Body() dto: AdminPromotionCreateDto,
    @Req() req: { ip?: string },
  ) {
    return this.portal.createPromotion(actor, dto, req.ip);
  }

  // ── Analytics ──────────────────────────────────────────────────────

  @Get('analytics')
  @Roles(...ANALYTICS)
  analytics(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('community') community?: string,
    @Query('city') city?: string,
  ) {
    return this.portal.analytics(from, to, community, city);
  }

  @Get('analytics/export.csv')
  @Roles(...ANALYTICS)
  @Header('Content-Type', 'text/csv')
  async analyticsCsv(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('community') community?: string,
    @Query('city') city?: string,
    @Res() res?: Response,
  ) {
    const csv = await this.portal.analyticsCsv(from, to, community, city);
    res!.setHeader(
      'Content-Disposition',
      'attachment; filename="analytics.csv"',
    );
    res!.send(csv);
  }

  // ── Audit ──────────────────────────────────────────────────────────

  @Get('audit')
  @Roles(...AUDIT)
  listAudit(
    @Query('actorId') actorId?: string,
    @Query('action') action?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.portal.listAudit(actorId, action, cursor);
  }
}
