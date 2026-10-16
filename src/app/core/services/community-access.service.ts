import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';

export interface CommunitySummary {
  communityId: number;
  name: string;
  ownedByMe: boolean;
  ownerAssigned: boolean;
  member: boolean;
  networks: {
    type: string;
    externalId: string;
    name: string;
    active: boolean | null;
  }[];
}

export interface CommunityAccess {
  communityId: number;
  owner: boolean;
  communityAdmin: boolean;
  activeMember: boolean;
  canManageCommunityAdmins: boolean;
  activeRoleIds: number[];
  capabilities: string[];
  teamScopes: {
    capability: string;
    unrestricted: boolean;
    sourceRoleIds: number[];
    targetRoleIds: number[];
  }[];
}

export interface CommunitySyncRun {
  runId: number;
  communityId: number;
  networkType: string;
  externalNetworkId: string;
  trigger: 'GUILD_JOIN' | 'STARTUP' | 'PERIODIC' | 'MANUAL' | 'OWNERSHIP_CHANGE';
  status: 'QUEUED' | 'RUNNING' | 'SUCCESS' | 'FAILED';
  startedAt: string | null;
  completedAt: string | null;
  observedMembers: number | null;
  updatedMembers: number | null;
  errorCode: string | null;
}

export interface CommunitySyncQueueResponse {
  runIds: number[];
  queuedNetworks: number;
}

@Injectable({ providedIn: 'root' })
export class CommunityAccessService {
  constructor(private readonly http: HttpClient) {}

  listCommunities(): Observable<CommunitySummary[]> {
    return this.http.get<CommunitySummary[]>(`${environment.apiBaseUrl}/user/me/communities`);
  }

  requestSync(communityId: number): Observable<CommunitySyncQueueResponse> {
    return this.http.post<CommunitySyncQueueResponse>(
      `${environment.apiBaseUrl}/user/me/communities/${communityId}/sync`,
      {}
    );
  }

  getLatestSync(communityId: number): Observable<CommunitySyncRun | null> {
    return this.http.get<CommunitySyncRun | null>(
      `${environment.apiBaseUrl}/user/me/communities/${communityId}/sync`
    );
  }

  getAccess(communityId: number): Observable<CommunityAccess> {
    return this.http.get<CommunityAccess>(
      `${environment.apiBaseUrl}/user/me/communities/${communityId}/access`
    );
  }
}
