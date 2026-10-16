import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface CommunityTeamDemand {
  id: number;
  name: string;
  description: string | null;
  roleIds: number[];
  createdAt: string;
  updatedAt: string;
}

export interface SaveCommunityTeamDemandRequest {
  name: string;
  description: string | null;
  roleIds: number[];
}

@Injectable({ providedIn: 'root' })
export class CommunityTeamDemandsService {
  constructor(private readonly http: HttpClient) {}

  // Legacy guild-scoped methods.
  list(guildId: string): Observable<CommunityTeamDemand[]> {
    return this.http.get<CommunityTeamDemand[]>(this.guildUrl(guildId));
  }

  create(guildId: string, request: SaveCommunityTeamDemandRequest): Observable<CommunityTeamDemand> {
    return this.http.post<CommunityTeamDemand>(this.guildUrl(guildId), request);
  }

  update(
    guildId: string,
    demandId: number,
    request: SaveCommunityTeamDemandRequest
  ): Observable<CommunityTeamDemand> {
    return this.http.put<CommunityTeamDemand>(`${this.guildUrl(guildId)}/${demandId}`, request);
  }

  delete(guildId: string, demandId: number): Observable<void> {
    return this.http.delete<void>(`${this.guildUrl(guildId)}/${demandId}`);
  }

  // Canonical Community-scoped methods.
  listCommunity(communityId: number): Observable<CommunityTeamDemand[]> {
    return this.http.get<CommunityTeamDemand[]>(this.communityUrl(communityId));
  }

  createCommunity(
    communityId: number,
    request: SaveCommunityTeamDemandRequest
  ): Observable<CommunityTeamDemand> {
    return this.http.post<CommunityTeamDemand>(this.communityUrl(communityId), request);
  }

  updateCommunity(
    communityId: number,
    demandId: number,
    request: SaveCommunityTeamDemandRequest
  ): Observable<CommunityTeamDemand> {
    return this.http.put<CommunityTeamDemand>(
      `${this.communityUrl(communityId)}/${demandId}`,
      request
    );
  }

  deleteCommunity(communityId: number, demandId: number): Observable<void> {
    return this.http.delete<void>(`${this.communityUrl(communityId)}/${demandId}`);
  }

  private guildUrl(guildId: string): string {
    return `${environment.apiBaseUrl}/user/me/guilds/${encodeURIComponent(guildId)}/team/demands`;
  }

  private communityUrl(communityId: number): string {
    return `${environment.apiBaseUrl}/user/me/communities/${communityId}/team/demands`;
  }
}
