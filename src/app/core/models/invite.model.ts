export interface InviteData {
  eventId: number;
  eventName: string;
  originalOwnerUserId: number;
  originalOwnerDisplayName: string;
}

export interface EventTransferInvite {
  valid: boolean;
  type: string; // 'EVENT_TRANSFER'
  status: string; // 'PENDING' | 'ACCEPTED' | 'REJECTED'
  id: number;
  requestedByUserId: number;
  requestedByDisplayName: string;
  targetUserId: number;
  targetDisplayName: string;
  reason: string;
  createdAt: string;
  respondedAt: string | null;
  inviteData: InviteData;
}
