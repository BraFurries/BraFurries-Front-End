import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { CreatorStudioAccess } from './creator-studio.service';

export type CreatorPilotFilter = 'ALL' | 'ACTIVE' | 'REVOKED' | 'SUSPENDED';

export interface CreatorPilotCandidate {
  userId: number;
  displayName: string;
  mergedAccount: boolean;
  currentAccess: CreatorStudioAccess;
}

export interface CreatorPilotInvitation {
  userId: number;
  displayName: string;
  tier: 'FREE' | 'PRO';
  sourceKind: 'INVITE' | 'PILOT' | 'BILLING';
  status: 'ACTIVE' | 'REVOKED' | 'SUSPENDED';
  active: boolean;
  startsAtUtc: string;
  expiresAtUtc: string | null;
  mergedAccount: boolean;
}

export interface CreatorPilotPage {
  items: CreatorPilotInvitation[];
  page: number;
  pageSize: number;
  total: number;
}

export type CreatorHoldCategory =
  'LEGAL_OBLIGATION' | 'DISPUTE' | 'DATA_REQUEST' | 'OTHER';

export interface CreatorRetentionHoldDraft {
  artistUserId: number;
  commissionId: number;
  category: CreatorHoldCategory;
  reason: string;
}

export interface CreatorRetentionHold extends CreatorRetentionHoldDraft {
  active: boolean;
}

/** Counts of expired commissions, without names, clients or individual identifiers. */
export interface CreatorRetentionDryRun {
  expiredCommissions: number;
  blockedByHold: number;
  blockedByMissingD30: number;
  blockedByMissingD7: number;
  smtpAcceptedBoth: number;
  providerConfirmedBoth: number;
  deliveryProofSupported: boolean;
}

/**
 * Owner-only administrative contract; authorization lives exclusively in API.
 * Does not create public invitations, checkout, bulk grants, or self-enrollment.
 */
@Injectable({ providedIn: 'root' })
export class CreatorStudioPilotAdminService {
  private readonly base = `${environment.apiBaseUrl}/user/me/creator-studio/admin/invitations`;
  private readonly holdsBase =
    `${environment.apiBaseUrl}/user/me/creator-studio/admin/retention/holds`;

  constructor(private readonly http: HttpClient) {}

  list(status: CreatorPilotFilter = 'ALL', page = 1, pageSize = 25):
    Observable<CreatorPilotPage> {
    const params = new HttpParams()
      .set('status', status)
      .set('page', String(page))
      .set('pageSize', String(pageSize));
    return this.http.get<CreatorPilotPage>(this.base, { params });
  }

  candidate(userId: number): Observable<CreatorPilotCandidate> {
    return this.http.get<CreatorPilotCandidate>(`${this.base}/candidate/${userId}`);
  }

  grantLifetimePro(userId: number): Observable<CreatorStudioAccess> {
    return this.http.post<CreatorStudioAccess>(
      `${this.base}/pilot-pro-lifetime/${userId}`, {});
  }

  revoke(userId: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${userId}`);
  }

  inspectHold(artistId: number, commissionId: number): Observable<CreatorRetentionHold> {
    return this.http.get<CreatorRetentionHold>(
      `${this.holdsBase}/${artistId}/${commissionId}`);
  }

  placeHold(draft: CreatorRetentionHoldDraft): Observable<CreatorRetentionHold> {
    return this.http.post<CreatorRetentionHold>(this.holdsBase, draft);
  }

  retentionDryRun(): Observable<CreatorRetentionDryRun> {
    return this.http.get<CreatorRetentionDryRun>(
      `${environment.apiBaseUrl}/user/me/creator-studio/admin/retention/dry-run`);
  }

  releaseHold(artistId: number, commissionId: number): Observable<void> {
    return this.http.delete<void>(
      `${this.holdsBase}/${artistId}/${commissionId}`);
  }
}
