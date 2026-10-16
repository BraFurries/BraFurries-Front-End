import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { CommunityTeamRole } from './community-team-roles.service';

export interface CommunityCapabilityDefinition {
  code: string;
  directGrantAllowed: boolean;
  roleGrantAllowed: boolean;
  hierarchicalTeamScope: boolean;
}

export interface CommunityCapabilityCatalog {
  capabilities: CommunityCapabilityDefinition[];
}

export interface CommunityMemberSummary {
  userId: number;
  displayName: string;
  username: string | null;
  profileImageUrl: string | null;
  status: 'active' | 'left' | 'banned' | 'pending' | 'unknown' | 'ambiguous';
  roleIds: number[];
}

export interface CommunityMemberSummaryResponse {
  items: CommunityMemberSummary[];
  pagination: {
    page: number;
    pageSize: number;
    totalElements: number;
    totalPages: number;
  };
}

export interface DirectCapabilityGrants {
  userId: number;
  capabilities: string[];
}

export interface RoleCapabilityGrants {
  roleId: number;
  capabilities: string[];
}

@Injectable({ providedIn: 'root' })
export class CommunityCapabilityService {
  constructor(private readonly http: HttpClient) {}

  catalog(communityId: number): Observable<CommunityCapabilityCatalog> {
    return this.http.get<CommunityCapabilityCatalog>(
      `${this.communityUrl(communityId)}/capabilities/catalog`
    );
  }

  listMembers(
    communityId: number,
    page = 1,
    pageSize = 100,
    search?: string
  ): Observable<CommunityMemberSummaryResponse> {
    let params = new HttpParams()
      .set('page', page)
      .set('pageSize', pageSize);
    const normalizedSearch = search?.trim();
    if (normalizedSearch) params = params.set('search', normalizedSearch);

    return this.http.get<CommunityMemberSummaryResponse>(
      `${this.communityUrl(communityId)}/members`,
      { params }
    );
  }

  listRoles(communityId: number): Observable<CommunityTeamRole[]> {
    return this.http.get<CommunityTeamRole[]>(
      `${this.communityUrl(communityId)}/team/roles`
    );
  }

  directGrants(communityId: number, userId: number): Observable<DirectCapabilityGrants> {
    return this.http.get<DirectCapabilityGrants>(
      `${this.communityUrl(communityId)}/members/${userId}/capabilities`
    );
  }

  grantDirect(
    communityId: number,
    userId: number,
    capability: string
  ): Observable<DirectCapabilityGrants> {
    return this.http.put<DirectCapabilityGrants>(
      `${this.communityUrl(communityId)}/members/${userId}/capabilities/${encodeURIComponent(capability)}`,
      {}
    );
  }

  revokeDirect(
    communityId: number,
    userId: number,
    capability: string
  ): Observable<DirectCapabilityGrants> {
    return this.http.delete<DirectCapabilityGrants>(
      `${this.communityUrl(communityId)}/members/${userId}/capabilities/${encodeURIComponent(capability)}`
    );
  }

  roleGrants(communityId: number, roleId: number): Observable<RoleCapabilityGrants> {
    return this.http.get<RoleCapabilityGrants>(
      `${this.communityUrl(communityId)}/team/roles/${roleId}/capabilities`
    );
  }

  grantRole(
    communityId: number,
    roleId: number,
    capability: string
  ): Observable<RoleCapabilityGrants> {
    return this.http.put<RoleCapabilityGrants>(
      `${this.communityUrl(communityId)}/team/roles/${roleId}/capabilities/${encodeURIComponent(capability)}`,
      {}
    );
  }

  revokeRole(
    communityId: number,
    roleId: number,
    capability: string
  ): Observable<RoleCapabilityGrants> {
    return this.http.delete<RoleCapabilityGrants>(
      `${this.communityUrl(communityId)}/team/roles/${roleId}/capabilities/${encodeURIComponent(capability)}`
    );
  }

  private communityUrl(communityId: number): string {
    return `${environment.apiBaseUrl}/user/me/communities/${communityId}`;
  }
}
