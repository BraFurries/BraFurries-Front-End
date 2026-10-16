export interface Pagination {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export type AdminUserRole = 'member' | 'supporter' | 'moderator' | 'admin';
export type AdminUserStatus = 'active' | 'muted' | 'banned';
export type AdminPartnerStatus = 'pending' | 'active' | 'suspended';
export type AdminPartnerCategory = 'community' | 'creator' | 'artist' | 'event' | 'meet' | 'discord_server' | 'brand' | 'other';
export type AdminBotStatusValue = 'online' | 'offline' | 'degraded' | 'restarting';
export type AdminMetricsPeriod = '7d' | '30d' | 'year';
export type AnnouncementDestination = 'discord' | 'telegram';
export type UserIdentityLinkStatus = 'CONFIRMED' | 'SUSPECTED';
export type UserIdentityLinkSource = 'ADMIN' | 'LEGACY_SPLIT' | 'SOCIAL';

export interface AdminSession {
  userId: number;
  name: string;
  role: 'admin' | 'moderator';
  permissions: string[];
}

export interface AdminOverview {
  systemStatus: 'operational' | 'degraded' | 'offline';
  metrics: {
    totalUsers: number;
    newUsersWeek: number;
    activePartners: number;
    pendingPartners: number;
    botStatus: AdminBotStatusValue;
    botPingMs: number;
    botServers: number;
    serverGrowthWeek: number;
    botReachedUsers: number;
  };
  recentActivities: {
    id: number;
    type: 'ban' | 'mute' | 'partner' | 'alert' | 'system';
    targetName: string;
    reason: string;
    createdAt: string;
    adminName: string;
  }[];
}

export interface AdminMetrics {
  summary: {
    commandsExecuted: number;
    commandsGrowthPercent: number;
    discordLinkRate: number;
    telegramLinkRate: number;
    dailyUniqueVisits: number;
    newRegistrations: number;
  };
  communityGrowth: {
    label: string;
    value: number;
  }[];
  platformDistribution: {
    platform: 'discord' | 'telegram' | 'site';
    members: number;
    percentage: number;
  }[];
  topCommands: {
    command: string;
    uses: number;
    description: string;
  }[];
}

export interface AdminBotStatus {
  status: AdminBotStatusValue;
  ready: boolean | null;
  connected: boolean | null;
  uptimeSeconds: number | null;
  startedAt: string | null;
  lastReadyAt: string | null;
  memoryUsedMb: number | null;
  memoryLimitMb: number | null;
  cpuUsagePercent: number | null;
  pingMs: number | null;
  guilds: number | null;
  users: number | null;
  commandsLoaded: number | null;
  cogsLoaded: number | null;
  pythonVersion: string | null;
  discordPyVersion: string | null;
  processId: number | null;
}

export interface AdminBotLogItem {
  sequence: number | null;
  timestamp: string;
  level: 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
  logger: string;
  message: string;
}

export interface AdminBotLogsResponse {
  status: 'available' | 'unavailable';
  items: AdminBotLogItem[];
  totalBuffered: number;
  limit: number;
  oldestSequence: number | null;
  latestSequence: number | null;
  /** Safe cursor for the next request; latestSequence is only the buffer head. */
  nextSequence: number | null;
  cursorExpired: boolean;
}

export interface AdminUserItem {
  id: number;
  name: string;
  avatarUrl?: string | null;
  email?: string | null;
  discordUsername?: string | null;
  discordAmbiguous?: boolean;
  telegramUsername?: string | null;
  status: AdminUserStatus;
  role: AdminUserRole;
  joinedAt?: string | null;
}

export interface AdminUsersResponse {
  items: AdminUserItem[];
  pagination: Pagination;
}

export interface AdminUserProfile {
  identity: {
    id: number;
    displayName: string;
    username?: string | null;
    email?: string | null;
    avatarUrl?: string | null;
    discordUsername?: string | null;
    telegramUsername?: string | null;
    discordAmbiguous?: boolean;
    telegramAmbiguous?: boolean;
    status: AdminUserStatus;
    role: AdminUserRole;
    birthDate?: string | null;
    plus18?: boolean | null;
    birthdayVerified?: boolean | null;
    birthdayRegistered?: boolean | null;
    localeId?: number | null;
    localeAbbrev?: string | null;
    localeName?: string | null;
    localeAmbiguous: boolean;
  };
  firstKnownAt?: string | null;
  firstKnownCommunity?: { id: number; name: string } | null;
  communities: {
    statusRecordId: number;
    id: number;
    name: string;
    guildId?: string | null;
    memberSince?: string | null;
    lastJoinDate?: string | null;
    approvedAt?: string | null;
    isPresent?: boolean | null;
    leftAt?: string | null;
    status: 'approved' | 'pending' | 'banned';
    approved?: boolean | null;
    banned?: boolean | null;
    vip: boolean;
    partner: boolean;
    birthdayMentionable?: boolean | null;
    inviteLinkUsed?: string | null;
    invitedBy?: string | null;
    discordActive: boolean;
  }[];
  moderation: {
    totalWarnings: number;
    activeWarnings: number;
    totalBans: number;
    activeBans: number;
    expiredBans: number;
    revokedBans: number;
    records: {
      id: number;
      type: 'warn' | 'ban';
      reason: string;
      moderator?: string | null;
      communityName?: string | null;
      occurredAt?: string | null;
      active: boolean;
      status: 'active' | 'expired' | 'revoked';
      canAppeal?: boolean | null;
      validUntil?: string | null;
      registeredAt?: string | null;
      revokedAt?: string | null;
      revokedById?: number | null;
      revokedByName?: string | null;
      revocationReason?: string | null;
    }[];
    pagination: Pagination;
  };
}

export type AdminContextDataState = 'available' | 'not_found' | 'ambiguous';

export interface AdminUserCommunityContext {
  userId: number;
  communityId: number;
  communityName: string;
  guildId?: string | null;
  memberships: {
    id: number;
    memberSince?: string | null;
    lastJoinDate?: string | null;
    approved?: boolean | null;
    approvedAt?: string | null;
    inviteLinkUsed?: string | null;
    invitedBy?: string | null;
    vip?: boolean | null;
    partner?: boolean | null;
    banned?: boolean | null;
    present?: boolean | null;
    leftAt?: string | null;
    birthdayMentionable?: boolean | null;
  }[];
  progression: {
    state: AdminContextDataState;
    recordCount: number;
    level?: number | null;
    totalXp?: number | null;
    dailyRecsCount?: number | null;
    weeklyBumpXp?: number | null;
    totalXpToday?: number | null;
    totalXpDay?: string | null;
    textXpToday?: number | null;
    textXpDay?: string | null;
    voiceXpToday?: number | null;
    voiceXpDay?: string | null;
  };
  economy: {
    state: AdminContextDataState;
    recordCount: number;
    records: { id: number; balance: number }[];
  };
  inventory: {
    id: number;
    storeItemId: number;
    name: string;
    quantity: number;
    service: boolean;
    usedIn?: string | null;
    validUntil?: string | null;
  }[];
  vip: {
    membershipVip?: boolean | null;
    customRoles: { id: number; color?: string | null; color2?: string | null; roleId?: string | null; iconId?: string | null }[];
  };
  temporaryRoles: { id: number; roleId: string; expiringAt: string; reason: string }[];
}

export interface AdminDiscordMemberState {
  guildId: string;
  discordUserId: string;
  username: string;
  displayName: string;
  nickname?: string | null;
  joinedAt?: string | null;
  roles: { id: string; name: string; color: string; position: number; managed: boolean }[];
}

export interface AdminUserReliability {
  user: {
    id: number;
    email?: string | null;
    username?: string | null;
    displayName?: string | null;
  };
  moderation: {
    totalWarnings: number;
    activeWarnings: number;
    expiredWarnings: number;
    warnedServers: number;
    averageWarningsPerWarnedServer: number;
    totalBans: number;
    activeBans: number;
    expiredBans: number;
    revokedBans: number;
    bannedServers: number;
    warningsByServer: {
      communityId: number;
      communityName: string;
      totalWarnings: number;
      activeWarnings: number;
      expiredWarnings: number;
    }[];
  };
  events: {
    managedEvents: number;
    ownedEvents: number;
    ownedApprovedEvents: number;
    ownedPendingEvents: number;
    ownedRejectedEvents: number;
    ownedPartnerEvents: number;
    staffEvents: number;
    staffEventsWithManageStaff: number;
    staffEventsWithEditEvent: number;
    staffEventsWithManageAgenda: number;
  };
  communities: {
    memberships: number;
    approvedMemberships: number;
    bannedMemberships: number;
    vipMemberships: number;
    partnerMemberships: number;
  };
  account: {
    linkedDiscord: boolean;
    discordUserId?: number | null;
    discordUsername?: string | null;
    linkedTelegram: boolean;
    telegramUserId?: number | null;
    telegramUsername?: string | null;
    discordAmbiguous?: boolean;
    telegramAmbiguous?: boolean;
  };
  reliability: {
    score: number;
    level: 'alta' | 'media' | 'baixa' | 'critica' | string;
    signals: string[];
  };
}

export interface IdentityDiscordAccount {
  discordUserId: string;
  username: string;
  displayName?: string | null;
}

export interface IdentityUserSummary {
  userId: number;
  username?: string | null;
  displayName?: string | null;
  email?: string | null;
  discordAccounts: IdentityDiscordAccount[];
}

export interface UserIdentityLinkView {
  id: number;
  userA: IdentityUserSummary;
  userB: IdentityUserSummary;
  status: UserIdentityLinkStatus;
  source: UserIdentityLinkSource;
  reason?: string | null;
  createdByUserId?: number | null;
  createdAt: string;
  revokedAt?: string | null;
  revokedByUserId?: number | null;
  revocationReason?: string | null;
}

export interface AdminUserIdentity {
  requestedUserId: number;
  confirmedAccounts: IdentityUserSummary[];
  confirmedLinks: UserIdentityLinkView[];
  suspectedLinks: UserIdentityLinkView[];
}

export interface AdminDiscordIdentityPreview {
  discordUserId: string;
  username: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  bot: boolean;
  existingUserId?: number | null;
  existingUserDisplayName?: string | null;
  alreadyInConfirmedCluster: boolean;
}

export interface AdminDiscordIdentityLinkResult {
  targetUserId: number;
  createdUser: boolean;
  link: UserIdentityLinkView;
}

interface ModerationHistoryBase {
  id: number;
  sourceUserId: number;
  sourceDiscordIds: string[];
}

export interface IdentityWarningHistory extends ModerationHistoryBase {
  communityId: number;
  communityName: string;
  date: string;
  reason: string;
  expired: boolean;
  appliedByUserId: number;
  appliedByName?: string | null;
}

export interface IdentityBanHistory extends ModerationHistoryBase {
  communityId: number;
  communityName: string;
  date: string;
  reason: string;
  canAppeal?: boolean | null;
  validUntil?: string | null;
  appliedByUserId?: number | null;
  appliedByName?: string | null;
  registeredAt: string;
  revokedAt?: string | null;
  revokedByUserId?: number | null;
  revocationReason?: string | null;
}

export interface IdentityNoteHistory extends ModerationHistoryBase {
  note: string;
  authorUserId: number;
  authorName?: string | null;
}

export interface AdminIdentityModerationHistory {
  requestedUserId: number;
  communityId: number;
  confirmedUserIds: number[];
  warnings: IdentityWarningHistory[];
  bans: IdentityBanHistory[];
  notes: IdentityNoteHistory[];
  suspectedLinks: UserIdentityLinkView[];
}

export interface PartnerLinkedResource {
  type: 'community' | 'event' | 'user' | 'discord_guild' | 'telegram_group' | 'external';
  id?: number | null;
  externalRef?: string | null;
  label?: string | null;
}

export interface PartnerExternalLinkItem {
  type: string;
  label?: string | null;
  url: string;
}

export interface PartnerPrefill {
  name?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  websiteUrl?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  links: PartnerExternalLinkItem[];
}

export interface PartnerLinkCandidate {
  resourceType: PartnerLinkedResource['type'];
  id: number | null;
  externalRef?: string | null;
  name: string;
  subtitle?: string | null;
  imageUrl?: string | null;
  prefill: PartnerPrefill;
}

export interface AdminPartnerItem {
  id: number;
  name: string;
  representativeName?: string | null;
  representativeUserId?: number | null;
  representative?: PartnerRepresentative | null;
  status: AdminPartnerStatus;
  category: AdminPartnerCategory;
  description?: string | null;
  imageUrl?: string | null;
  websiteUrl?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  linkedResource?: PartnerLinkedResource | null;
  links: PartnerExternalLinkItem[];
  clicks: number;
  invites: number;
  createdAt?: string | null;
}

export interface PartnerRepresentative {
  id: number;
  name: string;
  avatarUrl?: string | null;
  email?: string | null;
  discordUsername?: string | null;
  telegramUsername?: string | null;
}

export interface PartnerImageResponse { partnerId: number; imageUrl?: string | null; }

export interface AdminPartnersResponse {
  items: AdminPartnerItem[];
}

export interface CreatePartnerRequest {
  name: string;
  slug?: string;
  category: AdminPartnerCategory;
  status?: AdminPartnerStatus;
  description?: string;
  imageUrl?: string;
  websiteUrl?: string;
  contactName?: string;
  contactEmail?: string;
  representativeUserId?: number;
  communityId?: number;
  representativeName?: string;
  linkedResource?: PartnerLinkedResource;
  links?: PartnerExternalLinkItem[];
}

export interface UpdatePartnerRequest extends Partial<CreatePartnerRequest> {
  clearLinkedResource?: boolean;
  clearRepresentativeUser?: boolean;
}

export interface AnnouncementConfig {
  destinations: {
    id: AnnouncementDestination;
    label: string;
    enabled: boolean;
    targetName: string;
  }[];
  maxImageSizeMb: number;
  allowedImageTypes: string[];
}

export interface CreateAnnouncementRequest {
  destinations: AnnouncementDestination[];
  title: string;
  message: string;
}

export interface CreateAnnouncementResponse {
  id: number;
  status: 'sent' | 'partial' | 'failed';
  results: {
    destination: AnnouncementDestination;
    status: 'sent' | 'failed';
    error?: string | null;
  }[];
}
