import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface CommunityTeamRole {
  id: number;
  name: string;
  description: string | null;
  parentRoleId: number | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SaveCommunityTeamRoleRequest {
  name: string;
  description: string | null;
  parentRoleId: number | null;
}

export interface CommunityTeamRoleDeletionImpact {
  canDelete: boolean;
  childRoleCount: number;
  demandCount: number;
  assignmentCount: number;
}

@Injectable({ providedIn: 'root' })
export class CommunityTeamRolesService {
  constructor(private readonly http: HttpClient) { }

  // Legacy guild-scoped methods remain available during the rollout window.
  list(guildId: string): Observable<CommunityTeamRole[]> {
    return this.http.get<CommunityTeamRole[]>(this.guildUrl(guildId));
  }

  create(guildId: string, request: SaveCommunityTeamRoleRequest): Observable<CommunityTeamRole> {
    return this.http.post<CommunityTeamRole>(this.guildUrl(guildId), request);
  }

  update(guildId: string, roleId: number, request: SaveCommunityTeamRoleRequest): Observable<CommunityTeamRole> {
    return this.http.put<CommunityTeamRole>(`${this.guildUrl(guildId)}/${roleId}`, request);
  }

  setActive(guildId: string, roleId: number, active: boolean): Observable<CommunityTeamRole> {
    return this.http.patch<CommunityTeamRole>(`${this.guildUrl(guildId)}/${roleId}/active`, { active });
  }

  deletionImpact(guildId: string, roleId: number): Observable<CommunityTeamRoleDeletionImpact> {
    return this.http.get<CommunityTeamRoleDeletionImpact>(`${this.guildUrl(guildId)}/${roleId}/deletion-impact`);
  }

  delete(guildId: string, roleId: number): Observable<void> {
    return this.http.delete<void>(`${this.guildUrl(guildId)}/${roleId}`);
  }

  // Canonical Community-scoped methods.
  listCommunity(communityId: number): Observable<CommunityTeamRole[]> {
    return this.http.get<CommunityTeamRole[]>(this.communityUrl(communityId));
  }

  createCommunity(communityId: number, request: SaveCommunityTeamRoleRequest): Observable<CommunityTeamRole> {
    return this.http.post<CommunityTeamRole>(this.communityUrl(communityId), request);
  }

  updateCommunity(
    communityId: number,
    roleId: number,
    request: SaveCommunityTeamRoleRequest
  ): Observable<CommunityTeamRole> {
    return this.http.put<CommunityTeamRole>(`${this.communityUrl(communityId)}/${roleId}`, request);
  }

  setActiveCommunity(
    communityId: number,
    roleId: number,
    active: boolean
  ): Observable<CommunityTeamRole> {
    return this.http.patch<CommunityTeamRole>(
      `${this.communityUrl(communityId)}/${roleId}/active`,
      { active }
    );
  }

  deletionImpactCommunity(
    communityId: number,
    roleId: number
  ): Observable<CommunityTeamRoleDeletionImpact> {
    return this.http.get<CommunityTeamRoleDeletionImpact>(
      `${this.communityUrl(communityId)}/${roleId}/deletion-impact`
    );
  }

  deleteCommunity(communityId: number, roleId: number): Observable<void> {
    return this.http.delete<void>(`${this.communityUrl(communityId)}/${roleId}`);
  }

  private guildUrl(guildId: string): string {
    return `${environment.apiBaseUrl}/user/me/guilds/${encodeURIComponent(guildId)}/team/roles`;
  }

  private communityUrl(communityId: number): string {
    return `${environment.apiBaseUrl}/user/me/communities/${communityId}/team/roles`;
  }
}
