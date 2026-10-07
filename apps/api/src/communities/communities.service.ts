import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CommunityMembershipStatus,
  CommunityPrivacy,
} from '@prisma/client';
import { randomBytes } from 'crypto';
import { haversineKm } from '../providers/search.provider';
import { PrismaService } from '../prisma/prisma.service';
import { CommunityVisibilityService } from './community-visibility.service';
import type {
  CreateCommunityInviteDto,
  ListCommunitiesQueryDto,
  RedeemInviteDto,
} from './dto/communities.dto';
import { toPublicListing } from '../listings/public-listing.mapper';
import { PHASE22_COMMUNITY_SEEDS } from './community-seeds';

const ACTIVE_MEMBER: CommunityMembershipStatus[] = ['MEMBER', 'APPROVED'];

export { PHASE22_COMMUNITY_SEEDS };

@Injectable()
export class CommunitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly visibility: CommunityVisibilityService,
  ) {}

  async seedPrdCommunities() {
    for (const c of PHASE22_COMMUNITY_SEEDS) {
      await this.prisma.community.upsert({
        where: { slug: c.slug },
        create: {
          slug: c.slug,
          name: c.name,
          type: c.type,
          privacy: c.privacy,
          about: c.about,
          geoLat: c.geoLat,
          geoLng: c.geoLng,
          city: c.city ?? 'Lagos',
          verified: c.verified ?? false,
          active: true,
        },
        update: {
          name: c.name,
          type: c.type,
          privacy: c.privacy,
          about: c.about,
          geoLat: c.geoLat,
          geoLng: c.geoLng,
          city: c.city ?? 'Lagos',
          verified: c.verified ?? false,
          active: true,
        },
      });
    }
    return { upserted: PHASE22_COMMUNITY_SEEDS.length };
  }

  async list(query: ListCommunitiesQueryDto) {
    const rows = await this.prisma.community.findMany({
      where: {
        active: true,
        ...(query.type ? { type: query.type } : {}),
        ...(query.privacy ? { privacy: query.privacy } : {}),
      },
      orderBy: { name: 'asc' },
      take: Math.min(query.limit ?? 50, 50),
    });

    let filtered = rows;
    if (
      query.lat != null &&
      query.lng != null &&
      query.radiusKm != null
    ) {
      filtered = rows.filter((r) => {
        if (r.geoLat == null || r.geoLng == null) return false;
        return (
          haversineKm(query.lat!, query.lng!, r.geoLat, r.geoLng) <=
          query.radiusKm!
        );
      });
    }

    return {
      items: filtered.map((c) => this.toCommunityDto(c)),
    };
  }

  async getBySlugOrId(slugOrId: string, viewerId?: string | null) {
    const community = await this.findCommunity(slugOrId);
    if (!community || !community.active) {
      throw new NotFoundException('Community not found');
    }

    let membershipStatus: CommunityMembershipStatus | null = null;
    if (viewerId) {
      const m = await this.prisma.communityMembership.findUnique({
        where: {
          communityId_userId: { communityId: community.id, userId: viewerId },
        },
      });
      membershipStatus = m?.status ?? null;
    }

    return {
      ...this.toCommunityDto(community),
      membershipStatus,
      isMember: Boolean(
        membershipStatus && ACTIVE_MEMBER.includes(membershipStatus),
      ),
    };
  }

  async listMine(userId: string) {
    const rows = await this.prisma.communityMembership.findMany({
      where: {
        userId,
        status: { in: [...ACTIVE_MEMBER, 'INVITED'] },
      },
      include: { community: true },
      orderBy: { createdAt: 'desc' },
    });
    return {
      items: rows.map((m) => ({
        membershipId: m.id,
        status: m.status,
        joinedAt: m.joinedAt,
        community: this.toCommunityDto(m.community),
      })),
    };
  }

  async requestJoin(communityId: string, userId: string) {
    const community = await this.requireCommunity(communityId);
    if (community.privacy === CommunityPrivacy.PUBLIC) {
      const membership = await this.prisma.communityMembership.upsert({
        where: {
          communityId_userId: { communityId: community.id, userId },
        },
        create: {
          communityId: community.id,
          userId,
          status: 'MEMBER',
          joinedAt: new Date(),
        },
        update: {
          status: 'MEMBER',
          joinedAt: new Date(),
        },
      });
      return this.toMembershipDto(membership);
    }

    const existing = await this.prisma.communityMembership.findUnique({
      where: {
        communityId_userId: { communityId: community.id, userId },
      },
    });
    if (existing && ACTIVE_MEMBER.includes(existing.status)) {
      throw new ConflictException('Already a member');
    }
    if (existing?.status === 'INVITED') {
      return this.toMembershipDto(existing);
    }
    if (existing?.status === 'SUSPENDED') {
      throw new ForbiddenException('Membership suspended');
    }

    const membership = await this.prisma.communityMembership.upsert({
      where: {
        communityId_userId: { communityId: community.id, userId },
      },
      create: {
        communityId: community.id,
        userId,
        status: 'INVITED',
      },
      update: {
        status: 'INVITED',
        verifiedById: null,
        joinedAt: null,
      },
    });
    return this.toMembershipDto(membership);
  }

  async createInvite(
    communityId: string,
    userId: string,
    dto: CreateCommunityInviteDto,
  ) {
    const community = await this.requireCommunity(communityId);
    const isMember = await this.visibility.isActiveMember(
      userId,
      community.id,
    );
    const isManager = await this.prisma.communityManager.findUnique({
      where: {
        communityId_userId: { communityId: community.id, userId },
      },
    });
    if (!isMember && !isManager) {
      throw new ForbiddenException('Only members or managers can invite');
    }

    const expiryDays = Number(
      dto.expiryDays ??
        this.config.get('COMMUNITY_INVITE_EXPIRY_DAYS') ??
        7,
    );
    const code = randomBytes(6).toString('hex').toUpperCase();
    const invite = await this.prisma.communityInvite.create({
      data: {
        communityId: community.id,
        code,
        createdById: userId,
        maxUses: dto.maxUses ?? 1,
        expiresAt: new Date(Date.now() + expiryDays * 86_400_000),
      },
    });
    return {
      id: invite.id,
      code: invite.code,
      maxUses: invite.maxUses,
      useCount: invite.useCount,
      expiresAt: invite.expiresAt,
      communityId: invite.communityId,
    };
  }

  async redeemInvite(userId: string, dto: RedeemInviteDto) {
    const code = dto.code.trim().toUpperCase();
    const invite = await this.prisma.communityInvite.findUnique({
      where: { code },
    });
    if (!invite) throw new NotFoundException('Invite not found');
    if (invite.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Invite expired');
    }
    if (invite.useCount >= invite.maxUses) {
      throw new BadRequestException('Invite already used');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.communityInvite.updateMany({
        where: {
          id: invite.id,
          useCount: { lt: invite.maxUses },
          expiresAt: { gt: new Date() },
        },
        data: { useCount: { increment: 1 } },
      });
      if (updated.count === 0) {
        throw new BadRequestException('Invite already used or expired');
      }

      const membership = await tx.communityMembership.upsert({
        where: {
          communityId_userId: {
            communityId: invite.communityId,
            userId,
          },
        },
        create: {
          communityId: invite.communityId,
          userId,
          status: 'MEMBER',
          joinedAt: new Date(),
        },
        update: {
          status: 'MEMBER',
          joinedAt: new Date(),
        },
      });
      return membership;
    });

    return this.toMembershipDto(result);
  }

  async leave(membershipId: string, userId: string) {
    const membership = await this.prisma.communityMembership.findUnique({
      where: { id: membershipId },
    });
    if (!membership) throw new NotFoundException('Membership not found');
    if (membership.userId !== userId) {
      throw new ForbiddenException('Not your membership');
    }
    const updated = await this.prisma.communityMembership.update({
      where: { id: membershipId },
      data: { status: 'LEFT', joinedAt: null },
    });
    return this.toMembershipDto(updated);
  }

  async listListings(communityId: string, viewerId?: string | null) {
    const community = await this.requireCommunity(communityId);
    const canBrowse =
      community.privacy === CommunityPrivacy.PUBLIC ||
      community.privacy === CommunityPrivacy.SEMI_PRIVATE ||
      (viewerId
        ? await this.visibility.isActiveMember(viewerId, community.id)
        : false);

    if (!canBrowse) {
      // Same leak posture as private listings
      throw new NotFoundException('Community not found');
    }

    const rows = await this.prisma.listing.findMany({
      where: {
        communityId: community.id,
        status: { in: ['LIVE', 'RESERVED'] },
        AND: [this.visibility.visibleListingWhere(viewerId)],
      },
      include: {
        category: true,
        images: { orderBy: { sortOrder: 'asc' as const } },
        seller: {
          include: {
            profile: true,
            verifications: true,
            trustScore: true,
            _count: {
              select: {
                reviewsReceived: { where: { status: 'PUBLISHED' as const } },
              },
            },
          },
        },
        estateCommunity: true,
        movingSale: true,
      },
      orderBy: { publishedAt: 'desc' },
      take: 40,
    });

    return { items: rows.map((r) => toPublicListing(r)) };
  }

  private async findCommunity(slugOrId: string) {
    const byId = await this.prisma.community.findUnique({
      where: { id: slugOrId },
    });
    if (byId) return byId;
    return this.prisma.community.findUnique({ where: { slug: slugOrId } });
  }

  private async requireCommunity(id: string) {
    const community = await this.prisma.community.findUnique({
      where: { id },
    });
    if (!community || !community.active) {
      throw new NotFoundException('Community not found');
    }
    return community;
  }

  private toCommunityDto(c: {
    id: string;
    slug: string;
    name: string;
    type: string;
    privacy: string;
    coverUrl: string | null;
    about: string;
    verified: boolean;
    active: boolean;
    geoLat: number | null;
    geoLng: number | null;
  }) {
    return {
      id: c.id,
      slug: c.slug,
      name: c.name,
      type: c.type,
      privacy: c.privacy,
      coverUrl: c.coverUrl,
      about: c.about,
      verified: c.verified,
      active: c.active,
      geoLat: c.geoLat,
      geoLng: c.geoLng,
    };
  }

  private toMembershipDto(m: {
    id: string;
    communityId: string;
    userId: string;
    status: CommunityMembershipStatus;
    joinedAt: Date | null;
    createdAt: Date;
  }) {
    return {
      id: m.id,
      communityId: m.communityId,
      userId: m.userId,
      status: m.status,
      joinedAt: m.joinedAt,
      createdAt: m.createdAt,
    };
  }
}
