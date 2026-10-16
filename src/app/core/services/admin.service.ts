import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { HttpEventStreamService, LiveHttpEvent } from './http-event-stream.service';
import { environment } from '../../../environments/environment';
import {
  AdminBotStatus,
  AdminBotLogsResponse,
  AdminMetrics,
  AdminMetricsPeriod,
  AdminOverview,
  AdminPartnerCategory,
  AdminPartnerItem,
  AdminPartnersResponse,
  AdminPartnerStatus,
  AdminSession,
  AdminUserItem,
  AdminUserIdentity,
  AdminUserCommunityContext,
  AdminDiscordMemberState,
  AdminDiscordIdentityPreview,
  AdminDiscordIdentityLinkResult,
  AdminIdentityModerationHistory,
  AdminUserProfile,
  AdminUserReliability,
  AdminUserRole,
  AdminUsersResponse,
  AdminUserStatus,
  AnnouncementConfig,
  CreateAnnouncementRequest,
  CreateAnnouncementResponse,
  CreatePartnerRequest,
  PartnerImageResponse,
  PartnerLinkCandidate,
  UpdatePartnerRequest,
  UserIdentityLinkStatus,
  UserIdentityLinkView
} from '../../shared/models/api/admin/admin';

export interface AdminUsersFilters {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: AdminUserStatus | '';
  role?: AdminUserRole | '';
}

export interface AdminPartnersFilters {
  status?: AdminPartnerStatus | '';
  category?: AdminPartnerCategory | '';
}

@Injectable({
  providedIn: 'root'
})
export class AdminService {
  private readonly baseUrl = `${environment.apiBaseUrl}/admin`;

  constructor(private http: HttpClient, private liveEvents: HttpEventStreamService) { }

  getSession(): Observable<AdminSession> {
    return this.http.get<AdminSession>(`${this.baseUrl}/session`);
  }

  getOverview(): Observable<AdminOverview> {
    return this.http.get<AdminOverview>(`${this.baseUrl}/overview`);
  }

  getMetrics(period: AdminMetricsPeriod): Observable<AdminMetrics> {
    const params = new HttpParams().set('period', period);
    return this.http.get<AdminMetrics>(`${this.baseUrl}/metrics`, { params });
  }

  getBotStatus(): Observable<AdminBotStatus> {
    return this.http.get<AdminBotStatus>(`${this.baseUrl}/bot/status`);
  }

  watchBotConsole(
    level: string,
    after?: number | null
  ): Observable<LiveHttpEvent<AdminBotStatus | AdminBotLogsResponse>> {
    // Recreate the URI on every reconnect using the latest *consumed*
    // sequence, not the initial one, to avoid replay storms and expiration.
    let cursor = after;
    return this.liveEvents.watch<AdminBotStatus | AdminBotLogsResponse>(() => {
      let params = new HttpParams().set('level', level);
      if (cursor != null) params = params.set('after', cursor);
      return `${this.baseUrl}/bot/stream?${params.toString()}`;
    }).pipe(tap(event => {
      if (event.type === 'logs') {
        const next = (event.data as AdminBotLogsResponse).nextSequence;
        if (next != null) cursor = next;
      }
    }));
  }

  getBotLogs(limit: number = 200, level?: string, after?: number | null, before?: number | null): Observable<AdminBotLogsResponse> {
    let params = new HttpParams().set('limit', limit);
    if (level) {
      params = params.set('level', level);
    }
    if (after != null) {
      params = params.set('after', after);
    }
    if (before != null) {
      params = params.set('before', before);
    }
    return this.http.get<AdminBotLogsResponse>(`${this.baseUrl}/bot/logs`, { params });
  }

  getUsers(filters: AdminUsersFilters = {}): Observable<AdminUsersResponse> {
    return this.http.get<AdminUsersResponse>(`${this.baseUrl}/users`, {
      params: this.buildParams(filters)
    });
  }

  updateUserStatus(id: number, status: AdminUserStatus, reason?: string): Observable<AdminUserItem> {
    return this.http.patch<AdminUserItem>(`${this.baseUrl}/users/${id}/status`, { status, reason });
  }

  updateUserRole(id: number, role: AdminUserRole): Observable<AdminUserItem> {
    return this.http.patch<AdminUserItem>(`${this.baseUrl}/users/${id}/role`, { role });
  }

  getUserProfile(id: number, page = 1, pageSize = 20): Observable<AdminUserProfile> {
    return this.http.get<AdminUserProfile>(`${this.baseUrl}/users/${id}/profile`, {
      params: new HttpParams().set('page', page).set('pageSize', pageSize)
    });
  }

  getUserCommunityContext(id: number, communityId: number): Observable<AdminUserCommunityContext> {
    return this.http.get<AdminUserCommunityContext>(`${this.baseUrl}/users/${id}/communities/${communityId}/context`);
  }

  getUserDiscordMember(id: number, communityId: number): Observable<AdminDiscordMemberState> {
    return this.http.get<AdminDiscordMemberState>(`${this.baseUrl}/users/${id}/communities/${communityId}/discord-member`);
  }

  getUserReliability(id: number): Observable<AdminUserReliability> {
    return this.http.get<AdminUserReliability>(`${this.baseUrl}/users/${id}/reliability`);
  }

  getUserIdentity(id: number): Observable<AdminUserIdentity> {
    return this.http.get<AdminUserIdentity>(`${this.baseUrl}/users/${id}/identity`);
  }

  previewDiscordIdentity(userId: number, discordUserId: string): Observable<AdminDiscordIdentityPreview> {
    return this.http.get<AdminDiscordIdentityPreview>(
      `${this.baseUrl}/users/${userId}/discord-identities/${encodeURIComponent(discordUserId)}/preview`
    );
  }

  linkDiscordIdentity(userId: number, discordUserId: string, reason: string): Observable<AdminDiscordIdentityLinkResult> {
    return this.http.post<AdminDiscordIdentityLinkResult>(
      `${this.baseUrl}/users/${userId}/discord-identities`,
      { discordUserId, reason }
    );
  }

  getUserIdentityModerationHistory(id: number, communityId: number): Observable<AdminIdentityModerationHistory> {
    return this.http.get<AdminIdentityModerationHistory>(`${this.baseUrl}/users/${id}/moderation-history`, {
      params: new HttpParams().set('communityId', communityId)
    });
  }

  createUserIdentityLink(userId: number, otherUserId: number, status: UserIdentityLinkStatus, reason: string): Observable<UserIdentityLinkView> {
    return this.http.post<UserIdentityLinkView>(`${this.baseUrl}/users/${userId}/identity-links`, {
      otherUserId, status, reason
    });
  }

  updateUserIdentityLink(userAId: number, userBId: number, status: UserIdentityLinkStatus, reason: string): Observable<UserIdentityLinkView> {
    return this.http.patch<UserIdentityLinkView>(`${this.baseUrl}/users/${userAId}/identity-links/${userBId}`, {
      status, reason
    });
  }

  revokeUserIdentityLink(userAId: number, userBId: number, reason: string): Observable<UserIdentityLinkView> {
    return this.http.post<UserIdentityLinkView>(`${this.baseUrl}/users/${userAId}/identity-links/${userBId}/revoke`, { reason });
  }

  getPartners(filters: AdminPartnersFilters = {}): Observable<AdminPartnersResponse> {
    return this.http.get<AdminPartnersResponse>(`${this.baseUrl}/partners`, {
      params: this.buildParams(filters)
    });
  }

  getPartner(id: number): Observable<AdminPartnerItem> {
    return this.http.get<AdminPartnerItem>(`${this.baseUrl}/partners/${id}`);
  }

  getPartnerLinkableResources(category: AdminPartnerCategory, search?: string, limit = 20): Observable<PartnerLinkCandidate[]> {
    let params = new HttpParams()
      .set('category', category)
      .set('limit', Math.min(Math.max(limit, 1), 50));
    const normalizedSearch = search?.trim();
    if (normalizedSearch) {
      params = params.set('search', normalizedSearch);
    }
    return this.http.get<PartnerLinkCandidate[]>(`${this.baseUrl}/partners/linkable-resources`, { params });
  }

  createPartner(payload: CreatePartnerRequest): Observable<AdminPartnerItem> {
    return this.http.post<AdminPartnerItem>(`${this.baseUrl}/partners`, payload);
  }

  updatePartner(id: number, payload: UpdatePartnerRequest): Observable<AdminPartnerItem> {
    return this.http.patch<AdminPartnerItem>(`${this.baseUrl}/partners/${id}`, payload);
  }

  updatePartnerStatus(id: number, status: AdminPartnerStatus): Observable<AdminPartnerItem> {
    return this.http.patch<AdminPartnerItem>(`${this.baseUrl}/partners/${id}/status`, { status });
  }

  deletePartner(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/partners/${id}`);
  }

  uploadPartnerImage(id: number, file: File): Observable<PartnerImageResponse> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<PartnerImageResponse>(`${this.baseUrl}/partners/${id}/image`, formData);
  }

  deletePartnerImage(id: number): Observable<PartnerImageResponse> {
    return this.http.delete<PartnerImageResponse>(`${this.baseUrl}/partners/${id}/image`);
  }

  getAnnouncementConfig(): Observable<AnnouncementConfig> {
    return this.http.get<AnnouncementConfig>(`${this.baseUrl}/announcements/config`);
  }

  sendAnnouncement(payload: CreateAnnouncementRequest, image?: File | null): Observable<CreateAnnouncementResponse> {
    if (!image) {
      return this.http.post<CreateAnnouncementResponse>(`${this.baseUrl}/announcements`, payload);
    }

    const formData = new FormData();
    payload.destinations.forEach((destination) => formData.append('destinations', destination));
    formData.append('title', payload.title);
    formData.append('message', payload.message);
    formData.append('image', image);

    return this.http.post<CreateAnnouncementResponse>(`${this.baseUrl}/announcements`, formData);
  }

  private buildParams(filters: object): HttpParams {
    let params = new HttpParams();

    Object.entries(filters as Record<string, string | number | undefined>).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        params = params.set(key, value);
      }
    });

    return params;
  }
}
