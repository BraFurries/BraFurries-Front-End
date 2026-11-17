import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type CreatorStudioPlan = 'FREE' | 'PRO';
export type CreatorCommissionStatus = 'QUEUED' | 'IN_PROGRESS' | 'WAITING' | 'PAUSED' | 'COMPLETED';

export interface CreatorStudioAccess {
  allowed: boolean;
  tier: CreatorStudioPlan | null;
  status: string;
  sourceKind: string | null;
  expiresAtUtc: string | null;
}

export interface CreatorCommissionInput {
  title: string;
  clientName: string;
  description: string | null;
  privateNotes: string | null;
  requestedOn: string; // Date-only; never convert into a timezone-sensitive timestamp.
  dueOn: string | null;
  artTypeId: number | null;
}

export interface CreatorCommission extends CreatorCommissionInput {
  id: number;
  status: CreatorCommissionStatus;
  createdAtUtc: string;
  updatedAtUtc: string;
  completedAtUtc: string | null;
}

export interface CreatorCommissionPage {
  items: CreatorCommission[];
  page: number;
  pageSize: number;
  total: number;
}

/**
 * Backend is the authority for artist ownership and effective subscription.
 * Browser-side access checks only improve UX; they never grant access.
 */
@Injectable({ providedIn: 'root' })
export class CreatorStudioService {
  private readonly base = `${environment.apiBaseUrl}/user/me/creator-studio`;

  constructor(private readonly http: HttpClient) {}

  myAccess(): Observable<CreatorStudioAccess> {
    return this.http.get<CreatorStudioAccess>(`${this.base}/access`);
  }

  commissions(status: CreatorCommissionStatus | null, page = 1, pageSize = 25):
    Observable<CreatorCommissionPage> {
    let params = new HttpParams()
      .set('page', String(page))
      .set('pageSize', String(pageSize));
    if (status) params = params.set('status', status);
    return this.http.get<CreatorCommissionPage>(`${this.base}/commissions`, { params });
  }

  create(input: CreatorCommissionInput): Observable<CreatorCommission> {
    return this.http.post<CreatorCommission>(`${this.base}/commissions`, input);
  }

  update(id: number, input: CreatorCommissionInput): Observable<CreatorCommission> {
    return this.http.put<CreatorCommission>(`${this.base}/commissions/${id}`, input);
  }

  changeStatus(id: number, status: CreatorCommissionStatus): Observable<CreatorCommission> {
    return this.http.patch<CreatorCommission>(`${this.base}/commissions/${id}/status`, { status });
  }
}
