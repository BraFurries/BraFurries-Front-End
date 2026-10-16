import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type CommunityMemberDataState = 'AVAILABLE' | 'NOT_FOUND' | 'AMBIGUOUS';
export type CommunityMemberStatus = 'active' | 'left' | 'banned' | 'pending' | 'unknown' | 'ambiguous';

export interface CommunityMember {
  userId: number;
  displayName: string;
  username: string | null;
  profileImageUrl: string | null;
  membershipDataState: CommunityMemberDataState;
  membershipRecordCount: number;
  memberSince: string | null;
  status: CommunityMemberStatus;
  approved: boolean | null;
  banned: boolean | null;
  present: boolean | null;
  vip: boolean | null;
  partner: boolean | null;
}

export interface CommunityMemberSummary {
  userId: number;
  displayName: string;
  username: string | null;
  profileImageUrl: string | null;
  status: CommunityMemberStatus;
  roleIds: number[];
}

export interface CommunityMemberDetail {
  userId: number;
  displayName: string;
  username: string | null;
  profileImageUrl: string | null;
  membershipDataState: CommunityMemberDataState;
  membershipRecordCount: number;
  memberSince: string | null;
  lastJoinDate: string | null;
  status: CommunityMemberStatus;
  approved: boolean | null;
  approvedAt: string | null;
  banned: boolean | null;
  present: boolean | null;
  leftAt: string | null;
  vip: boolean | null;
  partner: boolean | null;
  roleIds: number[];
}

export interface CommunityMembersPagination {
  page: number;
  pageSize: number;
  totalElements: number;
  totalPages: number;
}

export interface CommunityMembersResponse {
  items: CommunityMember[];
  pagination: CommunityMembersPagination;
}

export interface CommunityMemberSummaryResponse {
  items: CommunityMemberSummary[];
  pagination: CommunityMembersPagination;
}

@Injectable({ providedIn: 'root' })
export class CommunityMembersService {
  constructor(private readonly http: HttpClient) {}

  // Legacy guild-scoped contracts stay available during the rollout window.
  list(guildId: string, page = 1, pageSize = 20, search?: string): Observable<CommunityMembersResponse> {
    let params = this.params(page, pageSize, search);
    return this.http.get<CommunityMembersResponse>(this.guildUrl(guildId), { params });
  }

  get(guildId: string, userId: number): Observable<CommunityMember> {
    return this.http.get<CommunityMember>(`${this.guildUrl(guildId)}/${userId}`);
  }

  // Canonical Community contracts.
  listCommunity(
    communityId: number,
    page = 1,
    pageSize = 20,
    search?: string
  ): Observable<CommunityMemberSummaryResponse> {
    return this.http.get<CommunityMemberSummaryResponse>(
      this.communityUrl(communityId),
      { params: this.params(page, pageSize, search) }
    );
  }

  getCommunityDetail(
    communityId: number,
    userId: number
  ): Observable<CommunityMemberDetail> {
    return this.http.get<CommunityMemberDetail>(
      `${this.communityUrl(communityId)}/${userId}`
    );
  }

  private params(page: number, pageSize: number, search?: string): HttpParams {
    let params = new HttpParams()
      .set('page', page)
      .set('pageSize', pageSize);
    const normalizedSearch = search?.trim();
    if (normalizedSearch) params = params.set('search', normalizedSearch);
    return params;
  }

  private guildUrl(guildId: string): string {
    return `${environment.apiBaseUrl}/user/me/guilds/${encodeURIComponent(guildId)}/members`;
  }

  private communityUrl(communityId: number): string {
    return `${environment.apiBaseUrl}/user/me/communities/${communityId}/members`;
  }
}
