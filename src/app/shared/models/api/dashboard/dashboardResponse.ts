export interface DashboardResponse {
  discord: {
    connected: boolean;
    discordUserId: number;
    username: string;
    displayName: string;
  };
  myStatus: {
    level: number;
    eventsAtended: string;
    lastBadge: string;
  };
  servers: {
    name: string;
    totalMembers: number;
    newMembers7D: string;
    engagement: string;
  }[];
  analytics: {
    name: string;
    data: string;
  }[];
  nextManagedEvent: {
    id: number;
    eventName: string;
    point: string;
    startingDatetime: string;
    endingDatetime: string;
    eventLogoUrl: string;
  } | null;
  events: {
    id: number;
    eventName: string;
    point: string;
    startingDatetime: string;
    endingDatetime: string;
    eventLogoUrl: string;
    isEvent: boolean;
    partnerEvent: boolean;
  }[];
  meets: {
    id: number;
    eventName: string;
    point: string;
    startingDatetime: string;
    endingDatetime: string;
    eventLogoUrl: string;
    isEvent: boolean;
    partnerEvent: boolean;
  }[];
}
