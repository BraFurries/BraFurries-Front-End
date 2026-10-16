import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';

export type CommunityActivityCategory = 'TEAM' | 'ACCESS' | 'NOTES' | 'COMMUNITY' | 'OTHER';

export interface CommunityActivityActor {
  userId: number;
  displayName: string;
  avatarUrl: string | null;
}

export interface CommunityActivityTarget {
  type: string;
  id: string;
  displayName: string;
}

export interface CommunityActivityDetails {
  capability: string | null;
  active: boolean | null;
  roleId: number | null;
  roleName: string | null;
  userId: number | null;
  userDisplayName: string | null;
  memberUserId: number | null;
  memberDisplayName: string | null;
  parentRoleId: number | null;
  parentRoleName: string | null;
  roleIds: number[] | null;
  roleNames: string[] | null;
  source: string | null;
}

export interface CommunityActivityEvent {
  id: number;
  action: string;
  category: CommunityActivityCategory;
  createdAt: string;
  actor: CommunityActivityActor | null;
  target: CommunityActivityTarget | null;
  details: CommunityActivityDetails;
  systemGenerated: boolean;
}

export interface CommunityActivityPage {
  items: CommunityActivityEvent[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface CommunityActivityFilters {
  category?: CommunityActivityCategory | '';
  actorUserId?: number | null;
  from?: string;
  to?: string;
  cursor?: string | null;
  limit?: number;
}

@Injectable({ providedIn: 'root' })
export class CommunityActivityService {
  constructor(private readonly http: HttpClient) {}

  list(communityId: number, filters: CommunityActivityFilters = {}): Observable<CommunityActivityPage> {
    let params = new HttpParams();

    if (filters.category) params = params.set('category', filters.category);
    if (filters.actorUserId != null) params = params.set('actorUserId', filters.actorUserId);
    if (filters.from) params = params.set('from', filters.from);
    if (filters.to) params = params.set('to', filters.to);
    if (filters.cursor) params = params.set('cursor', filters.cursor);
    if (filters.limit != null) params = params.set('limit', filters.limit);

    return this.http.get<CommunityActivityPage>(
      `${environment.apiBaseUrl}/user/me/communities/${communityId}/activity`,
      { params }
    );
  }

  actors(communityId: number): Observable<CommunityActivityActor[]> {
    return this.http.get<CommunityActivityActor[]>(
      `${environment.apiBaseUrl}/user/me/communities/${communityId}/activity/actors`
    );
  }
}
