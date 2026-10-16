import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Event } from '../../shared/models/api/events/event';

export interface EventWritePayload {
  eventName: string;
  city: string;
  address: string;
  startingDatetime: string | null;
  endingDatetime: string | null;
  localeId: number | null;
  description: string | null;
  pointName: string | null;
  price: number | null;
  maxPrice: number | null;
  groupChatLink: string | null;
  website: string | null;
  ticketUrl: string | null;
  priceConfirmed: boolean;
  outOfTickets: boolean;
  salesEnded: boolean;
  isEvent: boolean;
}

export type EventUpdatePayload = EventWritePayload;

export interface EventSchedulePayload {
  newStartingDatetime: string;
  newEndingDatetime: string;
}

export interface EventStaffPermission {
  userId: number;
  permissions: string[];
}

export interface AddStaffPayload {
  userId?: number;
  email?: string;
  mngAgenda: boolean;
  editEvent: boolean;
  mngStaff: boolean;
  cargo: string;
}

export interface UpdateStaffPayload {
  mngAgenda: boolean;
  editEvent: boolean;
  mngStaff: boolean;
  cargo: string;
}

export interface EventMinidash {
  activeOwnerEvents: number;
  activeStaffEvents: number;
  pendingReviewEvents: number;
}

export interface AdminEventMinidash {
  activeEvents: number;
  partnerEvents: number;
  pendingApprovalEvents: number;
}

export interface PendingApprovalEvent {
  id: number;
  eventName: string;
  city: string;
  localeAbbrev: string;
  localeName: string;
  startingDatetime: string;
  isEvent: boolean;
  partnerEvent: boolean;
  free: boolean;
  hostDisplayName: string;
  eventLogoUrl: string | null;
  createdAt: string;
  highlights: string[];
}

export interface ManagedEventSummary {
  id: number;
  host: {
    id: number;
    displayName: string;
  };
  eventName: string;
  city: string;
  localeAbbrev: string;
  localeName: string;
  startingDatetime: string;
  endingDatetime?: string;
  isEvent: boolean;
  partnerEvent: boolean;
  free: boolean;
  eventLogoUrl: string | null;
  highlights: string[];
  permissions: string[];
}

export interface PaginatedResponse<T> {
  items: T[];
  page: number;
  size: number;
  totalItems: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export type PaginatedManagedEventResponse = PaginatedResponse<ManagedEventSummary>;

export interface EventListFilters {
  userId?: number;
  weekStart?: string;
  month?: string;
  page?: number;
  size?: number;
}

export interface EventLocale {
  id: number;
  localeAbbrev: string;
  localeName: string;
}

export interface EventAvailabilityNearbyEvent {
  name: string;
  city: string;
  localeId: number;
  localeAbbrev: string;
  localeName: string;
  date: string;
  endingDate?: string | null;
  type: string;
}

export interface EventAvailabilityResponse {
  date: string;
  localeId: number;
  city: string;
  localeAvailable: boolean;
  cityAvailable: boolean;
  nearbyEvents: EventAvailabilityNearbyEvent[];
}

@Injectable({
  providedIn: 'root'
})
export class EventService {
  constructor(private http: HttpClient) { }

  getLocales(): Observable<EventLocale[]> {
    const endpoint = `${environment.apiBaseUrl}/meta/locales`;

    return this.http.get<EventLocale[]>(endpoint);
  }

  getEventAvailability(localeId: number, city: string, date: string): Observable<EventAvailabilityResponse> {
    const endpoint = `${environment.apiBaseUrl}/events/availability`;
    const params = new HttpParams()
      .set('localeId', localeId)
      .set('city', city)
      .set('date', date);

    return this.http.get<EventAvailabilityResponse>(endpoint, { params });
  }

  getEventsMinidash(): Observable<EventMinidash> {
    const endpoint = `${environment.apiBaseUrl}/events/minidash`;

    return this.http.get<EventMinidash>(endpoint);
  }

  getAdminEventsMinidash(): Observable<AdminEventMinidash> {
    const endpoint = `${environment.apiBaseUrl}/events/minidash/admin`;

    return this.http.get<AdminEventMinidash>(endpoint);
  }

  getPendingApprovalEvents(filters?: EventListFilters): Observable<PaginatedResponse<PendingApprovalEvent>> {
    const endpoint = `${environment.apiBaseUrl}/events/pending-approval`;
    const params = this.buildManagedEventsParams(filters);

    return this.http.get<PaginatedResponse<PendingApprovalEvent>>(endpoint, { params });
  }

  getPartnerEvents(filters?: EventListFilters): Observable<PaginatedManagedEventResponse> {
    const endpoint = `${environment.apiBaseUrl}/events/partner`;
    const params = this.buildManagedEventsParams(filters);

    return this.http.get<PaginatedManagedEventResponse>(endpoint, { params });
  }

  getCommonEvents(filters?: number | EventListFilters): Observable<PaginatedManagedEventResponse> {
    const endpoint = `${environment.apiBaseUrl}/events/common`;
    const normalizedFilters = typeof filters === 'number' ? { userId: filters } : filters;
    const params = this.buildManagedEventsParams(normalizedFilters);

    return this.http.get<PaginatedManagedEventResponse>(endpoint, { params });
  }

  getEventById(eventId: number): Observable<Event> {
    const endpoint = `${environment.apiBaseUrl}/events/${eventId}`;

    return this.http.get<Event>(endpoint);
  }

  getEventStaffById(eventId: number): Observable<EventStaffPermission[]> {
    const endpoint = `${environment.apiBaseUrl}/events/${eventId}/staff`;
    return this.http.get<EventStaffPermission[]>(endpoint);
  }

  addEventStaff(eventId: number, payload: AddStaffPayload): Observable<void> {
    const endpoint = `${environment.apiBaseUrl}/events/${eventId}/staff`;
    return this.http.post<void>(endpoint, payload);
  }

  updateEventStaff(eventId: number, userId: number, payload: UpdateStaffPayload): Observable<void> {
    const endpoint = `${environment.apiBaseUrl}/events/${eventId}/staff/${userId}`;
    return this.http.patch<void>(endpoint, payload);
  }

  removeEventStaff(eventId: number, userId: number): Observable<void> {
    const endpoint = `${environment.apiBaseUrl}/events/${eventId}/staff/${userId}`;
    return this.http.delete<void>(endpoint);
  }

  createEvent(payload: EventWritePayload): Observable<Event> {
    const endpoint = `${environment.apiBaseUrl}/events`;

    return this.http.post<Event>(endpoint, payload);
  }

  updateEvent(eventId: number, payload: EventUpdatePayload): Observable<Event> {
    const endpoint = `${environment.apiBaseUrl}/events/${eventId}`;

    return this.http.patch<Event>(endpoint, payload);
  }

  updateEventSchedule(eventId: number, payload: EventSchedulePayload): Observable<Event> {
    const endpoint = `${environment.apiBaseUrl}/events/${eventId}/schedule`;

    return this.http.patch<Event>(endpoint, payload);
  }

  approveEvent(eventId: number): Observable<unknown> {
    const endpoint = `${environment.apiBaseUrl}/events/${eventId}/approve`;

    return this.http.patch(endpoint, {});
  }

  rejectEvent(eventId: number): Observable<unknown> {
    const endpoint = `${environment.apiBaseUrl}/events/${eventId}/reject`;

    return this.http.patch(endpoint, {});
  }

  addEventPartner(eventId: number): Observable<unknown> {
    const endpoint = `${environment.apiBaseUrl}/events/${eventId}/partner`;

    return this.http.post(endpoint, {});
  }

  removeEventPartner(eventId: number): Observable<unknown> {
    const endpoint = `${environment.apiBaseUrl}/events/${eventId}/partner`;

    return this.http.delete(endpoint);
  }

  deleteEvent(eventId: number): Observable<unknown> {
    const endpoint = `${environment.apiBaseUrl}/events/${eventId}`;

    return this.http.delete(endpoint);
  }

  uploadEventLogo(eventId: number, file: File): Observable<unknown> {
    const endpoint = `${environment.apiBaseUrl}/events/${eventId}/logo`;
    const formData = new FormData();
    formData.append('file', file);
    return this.http.put(endpoint, formData);
  }

  deleteEventLogo(eventId: number): Observable<unknown> {
    const endpoint = `${environment.apiBaseUrl}/events/${eventId}/logo`;
    return this.http.delete(endpoint);
  }

  transferEventOwnership(eventId: number, payload: { targetEmail?: string; targetUserId?: number; reason?: string }): Observable<unknown> {
    const endpoint = `${environment.apiBaseUrl}/events/${eventId}/transfer-request`;
    return this.http.post(endpoint, payload);
  }

  private buildManagedEventsParams(filters?: EventListFilters): HttpParams | undefined {
    if (!filters) {
      return undefined;
    }

    let params = new HttpParams();

    if (filters.userId) {
      params = params.set('idUsuario', filters.userId);
    }

    if (filters.weekStart) {
      params = params.set('weekStart', filters.weekStart);
    }

    if (filters.month) {
      params = params.set('month', filters.month);
    }

    if (filters.page !== undefined) {
      params = params.set('page', filters.page);
    }

    if (filters.size !== undefined) {
      params = params.set('size', filters.size);
    }

    return params.keys().length > 0 ? params : undefined;
  }
}
