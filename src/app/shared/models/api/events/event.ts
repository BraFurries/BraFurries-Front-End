export interface EventStaff {
  userId: number;
  displayName: string;
  cargo: string | null;
}

export interface EventHost {
  id: number;
  displayName: string;
}

export interface Event {
  id: number;
  host: EventHost;
  localeId: number;
  localeAbbrev: string;
  localeName: string;
  eventName: string;
  description: string | null;
  city: string;
  address: string;
  pointName: string;
  price: number;
  maxPrice: number;
  priceConfirmed: boolean;
  groupChatLink: string | null;
  website: string | null;
  ticketUrl: string | null;
  startingDatetime: string;
  endingDatetime: string;
  eventLogoUrl: string | null;
  outOfTickets: boolean;
  salesEnded: boolean;
  approved: boolean | null;
  isEvent: boolean;
  partnerEvent: boolean;
  gcalEventId: string | null;
  staffs: EventStaff[];
  highlights?: string[];
}
