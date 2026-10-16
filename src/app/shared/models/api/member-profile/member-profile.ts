export type MemberDataState = 'AVAILABLE' | 'NOT_FOUND' | 'AMBIGUOUS';

export interface ExternalAccountState {
  state: MemberDataState;
  recordCount: number;
  username: string | null;
  displayName: string | null;
}

export interface MemberCommunitySummary {
  communityId: number;
  communityName: string;
  guildId: string | null;
  membershipState: MemberDataState;
  membershipRecordCount: number;
}

export interface FirstKnownCommunity {
  state: MemberDataState;
  communityId: number | null;
  communityName: string | null;
  memberSince: string | null;
}

export interface MemberProfileResponse {
  userId: number;
  displayName: string | null;
  username: string | null;
  profileImageUrl: string | null;
  birthday: string | null;
  discord: ExternalAccountState;
  telegram: ExternalAccountState;
  communityCount: number;
  firstKnownCommunity: FirstKnownCommunity;
  communities: MemberCommunitySummary[];
}

export interface UpdateMemberProfileResponse {
  userId: number;
  displayName: string;
}

export interface UpdateProfileImageResponse {
  userId: number;
  profileImageUrl: string | null;
}

export interface MemberCommunityContextResponse {
  community: { communityId: number; communityName: string; guildId: string | null };
  membership: {
    state: MemberDataState; recordCount: number; memberSince: string | null; lastJoinDate: string | null;
    approved: boolean | null; approvedAt: string | null; present: boolean | null; leftAt: string | null;
    vip: boolean | null; partner: boolean | null;
  };
  progression: { state: MemberDataState; recordCount: number; level: number | null; totalXp: number | null };
  economy: { state: MemberDataState; recordCount: number; balance: number | null };
  inventory: MemberInventoryItem[];
  moderation: { totalWarnings: number; activeWarnings: number; totalBans: number; activeBans: number };
}

export interface MemberInventoryItem {
  inventoryId: number;
  storeItemId: number;
  name: string;
  imageUrl: string | null;
  quantity: number | null;
  service: boolean | null;
  usedAt: string | null;
  validUntil: string | null;
}

export interface MemberModerationRecord {
  id: number;
  type: 'warn' | 'ban';
  reason: string;
  occurredAt: string;
  status: 'active' | 'expired' | 'revoked';
  canAppeal: boolean | null;
  validUntil: string | null;
  revokedAt: string | null;
  revocationReason: string | null;
}

export interface MemberModerationPage {
  items: MemberModerationRecord[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}
