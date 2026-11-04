import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface PlatformAccess {
  enabled: boolean;
  owner: boolean;
  permissions: string[];
}

export interface PlatformApprovedPerson {
  userId: number;
  name: string;
  permissions: string[];
}

export interface PlatformEligiblePerson {
  userId: number;
  name: string;
}

export interface PlatformTeamRole {
  roleId: number;
  name: string;
  active: boolean;
  permissions: string[];
}

/** No hardcoded catalog in frontend: GET /permissions is the source of truth. */
export type PlatformPermissionCode = string;

export interface PlatformPermissionDefinition {
  code: PlatformPermissionCode;
  area: string;
  label: string;
  description: string;
}

@Injectable({ providedIn: 'root' })
export class PlatformAccessService {
  private readonly baseUrl = `${environment.apiBaseUrl}/user/me/platform-access`;

  constructor(private readonly http: HttpClient) {}

  myAccess(): Observable<PlatformAccess> {
    return this.http.get<PlatformAccess>(`${this.baseUrl}/me`);
  }

  permissionCatalog(): Observable<PlatformPermissionDefinition[]> {
    return this.http.get<PlatformPermissionDefinition[]>(`${this.baseUrl}/permissions`);
  }

  approvedPeople(): Observable<PlatformApprovedPerson[]> {
    return this.http.get<PlatformApprovedPerson[]>(`${this.baseUrl}/people`);
  }

  eligiblePeople(search: string): Observable<PlatformEligiblePerson[]> {
    return this.http.get<PlatformEligiblePerson[]>(`${this.baseUrl}/people/search`, {
      params: { search }
    });
  }

  teamRoles(): Observable<PlatformTeamRole[]> {
    return this.http.get<PlatformTeamRole[]>(`${this.baseUrl}/team-roles`);
  }

  approve(userId: number): Observable<void> {
    return this.http.put<void>(`${this.baseUrl}/people/${userId}`, {});
  }

  revoke(userId: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/people/${userId}`);
  }

  personPermission(userId: number, code: PlatformPermissionCode, granted: boolean): Observable<void> {
    const url = `${this.baseUrl}/people/${userId}/permissions/${code}`;
    return granted ? this.http.put<void>(url, {}) : this.http.delete<void>(url);
  }

  rolePermission(roleId: number, code: PlatformPermissionCode, granted: boolean): Observable<void> {
    const url = `${this.baseUrl}/team-roles/${roleId}/permissions/${code}`;
    return granted ? this.http.put<void>(url, {}) : this.http.delete<void>(url);
  }
}
