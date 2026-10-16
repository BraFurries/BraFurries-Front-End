export interface UserReliability {
  user: {
    id: number;
    email: string;
    username: string | null;
    displayName: string;
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
    bannedServers: number;
    warningsByServer: any[];
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
    discordUserId: string | null;
    discordUsername: string | null;
    linkedTelegram: boolean;
    telegramUserId: string | null;
    telegramUsername: string | null;
  };
  reliability: {
    score: number;
    level: string;
    signals: string[];
  };
}
