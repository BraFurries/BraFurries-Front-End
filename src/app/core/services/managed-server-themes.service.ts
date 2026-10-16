import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';

export type ThemeAssetAction = 'UNCHANGED' | 'SET' | 'REMOVE';
export type ThemeResourceType = 'CHANNEL' | 'CATEGORY' | 'ROLE';
export type ThemeOperationStatus = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'PARTIAL' | 'FAILED';

export interface ThemeResourceRequest {
  resourceType: ThemeResourceType;
  resourceId: string;
  targetName: string;
}

export interface ThemeSaveRequest {
  name: string;
  description: string;
  iconAction: ThemeAssetAction;
  bannerAction: ThemeAssetAction;
  resources: ThemeResourceRequest[];
}

export interface ThemeAsset {
  action: ThemeAssetAction;
  url: string | null;
  contentType: string | null;
  sha256: string | null;
  sizeBytes: number | null;
}

export interface ThemeResource {
  id: number;
  resourceType: ThemeResourceType;
  resourceId: string;
  targetName: string;
}

export interface Theme {
  id: number;
  guildId: string;
  name: string;
  description: string | null;
  icon: ThemeAsset;
  banner: ThemeAsset;
  resources: ThemeResource[];
  createdAt: string | null;
  updatedAt: string | null;
}

export interface ThemeEditableRole {
  id: string;
  name: string;
  position: number | null;
  eligible: boolean;
  unavailableReason: string | null;
}

export interface ThemeEditableChannel {
  id: string;
  name: string;
  type: string;
  categoryId: string | null;
}

export interface ThemeEditableCategory {
  id: string;
  name: string;
}

export interface ThemeResources {
  channels: ThemeEditableChannel[];
  categories: ThemeEditableCategory[];
  roles: ThemeEditableRole[];
}

export interface ThemePreviewChange {
  resourceType: string;
  resourceId: string;
  beforeValue: string | null;
  targetValue: string | null;
  action: string;
}

export interface ThemePreviewIssue {
  code: string;
  resourceType: string;
  resourceId: string;
  message: string;
}

export interface ThemePreview {
  guildId: string;
  themeId: number;
  changes: ThemePreviewChange[];
  warnings: ThemePreviewIssue[];
  blockers: ThemePreviewIssue[];
  ready: boolean;
}

export interface ThemeOperationStep {
  id: number;
  code: string;
  status: string;
  message: string;
  progressCurrent: number;
  progressTotal: number;
  detail: unknown;
  createdAt: string | null;
}

export interface ThemeOperation {
  id: number;
  applicationId: number;
  operationType: 'APPLY' | 'RESTORE';
  status: ThemeOperationStatus;
  progressCurrent: number;
  progressTotal: number;
  currentStep: string | null;
  result: unknown;
  errorCode: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string | null;
  steps: ThemeOperationStep[];
}

export interface ThemeApplication {
  id: number;
  themeId: number;
  themeName: string;
  guildId: string;
  actorDiscordUserId: string;
  status: string;
  appliedAt: string | null;
  restoredAt: string | null;
  errorSummary: string | null;
  latestOperation: ThemeOperation | null;
}

export interface ThemesResponse {
  themes: Theme[];
  activeApplication: ThemeApplication | null;
}

export interface ThemeApplicationsResponse {
  applications: ThemeApplication[];
}

@Injectable({ providedIn: 'root' })
export class ManagedServerThemesService {
  constructor(private readonly http: HttpClient) {}

  listThemes(guildId: string): Observable<ThemesResponse> {
    return this.http.get<ThemesResponse>(this.baseUrl(guildId));
  }

  getResources(guildId: string): Observable<ThemeResources> {
    return this.http.get<ThemeResources>(this.baseUrl(guildId) + '/resources');
  }

  createTheme(guildId: string, request: ThemeSaveRequest): Observable<Theme> {
    return this.http.post<Theme>(this.baseUrl(guildId), request);
  }

  updateTheme(guildId: string, themeId: number, request: ThemeSaveRequest): Observable<Theme> {
    return this.http.put<Theme>(this.baseUrl(guildId) + '/' + themeId, request);
  }

  deleteTheme(guildId: string, themeId: number): Observable<void> {
    return this.http.delete<void>(this.baseUrl(guildId) + '/' + themeId);
  }

  uploadAsset(
    guildId: string,
    themeId: number,
    assetType: 'ICON' | 'BANNER',
    file: File
  ): Observable<Theme> {
    const form = new FormData();
    form.append('file', file);
    return this.http.put<Theme>(
      this.baseUrl(guildId) + '/' + themeId + '/assets/' + assetType,
      form
    );
  }

  previewTheme(guildId: string, themeId: number): Observable<ThemePreview> {
    return this.http.post<ThemePreview>(
      this.baseUrl(guildId) + '/' + themeId + '/preview',
      {}
    );
  }

  applyTheme(
    guildId: string,
    themeId: number,
    idempotencyKey: string
  ): Observable<ThemeOperation> {
    return this.http.post<ThemeOperation>(
      this.baseUrl(guildId) + '/' + themeId + '/apply',
      { confirmed: true },
      { headers: { 'Idempotency-Key': idempotencyKey } }
    );
  }

  getApplications(guildId: string): Observable<ThemeApplicationsResponse> {
    return this.http.get<ThemeApplicationsResponse>(
      this.baseUrl(guildId) + '/applications'
    );
  }

  getApplication(guildId: string, applicationId: number): Observable<ThemeApplication> {
    return this.http.get<ThemeApplication>(
      this.baseUrl(guildId) + '/applications/' + applicationId
    );
  }

  restoreApplication(
    guildId: string,
    applicationId: number,
    force: boolean,
    idempotencyKey: string
  ): Observable<ThemeOperation> {
    return this.http.post<ThemeOperation>(
      this.baseUrl(guildId) + '/applications/' + applicationId + '/restore',
      { confirmed: true, force },
      { headers: { 'Idempotency-Key': idempotencyKey } }
    );
  }

  private baseUrl(guildId: string): string {
    return environment.apiBaseUrl
      + '/user/me/guilds/'
      + encodeURIComponent(guildId)
      + '/themes';
  }
}
