import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { CommunityMember } from './community-members.service';
import { CommunityTeamRole } from './community-team-roles.service';

export interface CommunityTeamAssignment {
  roleId: number;
  userId: number;
  createdAt: string | null;
}

export interface TeamMemberRef {
  userId: number;
  displayName: string;
  username: string | null;
  profileImageUrl: string | null;
}

export interface TeamMemberCandidateResponse {
  items: TeamMemberRef[];
  pagination: {
    page: number;
    pageSize: number;
    totalElements: number;
    totalPages: number;
  };
}

@Injectable({ providedIn: 'root' })
export class CommunityTeamAssignmentsService {
  constructor(private readonly http: HttpClient) {}

  // Legacy guild-scoped methods.
  listMembers(guildId: string, roleId: number): Observable<CommunityMember[]> {
    return this.http.get<CommunityMember[]>(`${this.guildTeamUrl(guildId)}/roles/${roleId}/members`);
  }

  assign(guildId: string, roleId: number, userId: number): Observable<CommunityTeamAssignment> {
    return this.http.put<CommunityTeamAssignment>(
      `${this.guildTeamUrl(guildId)}/roles/${roleId}/members/${userId}`,
      {}
    );
  }

  remove(guildId: string, roleId: number, userId: number): Observable<void> {
    return this.http.delete<void>(
      `${this.guildTeamUrl(guildId)}/roles/${roleId}/members/${userId}`
    );
  }

  listRoles(guildId: string, userId: number): Observable<CommunityTeamRole[]> {
    return this.http.get<CommunityTeamRole[]>(
      `${this.guildTeamUrl(guildId)}/members/${userId}/roles`
    );
  }

  // Canonical Community-scoped methods.
  listMembersCommunity(communityId: number, roleId: number): Observable<TeamMemberRef[]> {
    return this.http.get<TeamMemberRef[]>(
      `${this.communityTeamUrl(communityId)}/roles/${roleId}/members`
    );
  }

  listMemberCandidatesCommunity(
    communityId: number,
    roleId: number,
    page = 1,
    pageSize = 100,
    search?: string
  ): Observable<TeamMemberCandidateResponse> {
    let params = new HttpParams()
      .set('page', page)
      .set('pageSize', pageSize);
    const normalized = search?.trim();
    if (normalized) params = params.set('search', normalized);

    return this.http.get<TeamMemberCandidateResponse>(
      `${this.communityTeamUrl(communityId)}/roles/${roleId}/member-candidates`,
      { params }
    );
  }

  assignCommunity(
    communityId: number,
    roleId: number,
    userId: number
  ): Observable<CommunityTeamAssignment> {
    return this.http.put<CommunityTeamAssignment>(
      `${this.communityTeamUrl(communityId)}/roles/${roleId}/members/${userId}`,
      {}
    );
  }

  removeCommunity(communityId: number, roleId: number, userId: number): Observable<void> {
    return this.http.delete<void>(
      `${this.communityTeamUrl(communityId)}/roles/${roleId}/members/${userId}`
    );
  }

  listRolesCommunity(communityId: number, userId: number): Observable<CommunityTeamRole[]> {
    return this.http.get<CommunityTeamRole[]>(
      `${this.communityTeamUrl(communityId)}/members/${userId}/roles`
    );
  }

  private guildTeamUrl(guildId: string): string {
    return `${environment.apiBaseUrl}/user/me/guilds/${encodeURIComponent(guildId)}/team`;
  }

  private communityTeamUrl(communityId: number): string {
    return `${environment.apiBaseUrl}/user/me/communities/${communityId}/team`;
  }
}
