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
  workflowId?: number | null; // Optional for creation only; changing a model never rewrites steps.
}

export interface CreatorCommission extends CreatorCommissionInput {
  id: number;
  status: CreatorCommissionStatus;
  createdAtUtc: string;
  updatedAtUtc: string;
  completedAtUtc: string | null;
  currentStageName?: string | null;
  currentStageDefinitionId?: number | null;
}

export interface CreatorCommissionPage {
  items: CreatorCommission[];
  page: number;
  pageSize: number;
  total: number;
}

export interface CreatorArtType {
  id: number;
  name: string;
  workflowId: number | null;
}
export interface CreatorStageDefinition { id: number; name: string; }
export interface CreatorStepDraft { name: string; stageDefinitionId: number | null; }
export interface CreatorWorkflowDraft {
  name: string;
  isDefault: boolean;
  steps: CreatorStepDraft[];
}
export interface CreatorWorkflowStep extends CreatorStepDraft {
  id: number;
  position: number;
}
export interface CreatorWorkflow {
  id: number;
  name: string;
  isDefault: boolean;
  steps: CreatorWorkflowStep[];
}
export type CreatorStepStatus = 'PENDING' | 'IN_PROGRESS' | 'WAITING_APPROVAL' | 'DONE';
export interface CreatorCommissionStep extends CreatorStepDraft {
  id: number;
  commissionId: number;
  position: number;
  status: CreatorStepStatus;
  notes: string | null;
  completedAtUtc: string | null;
}
export interface CreatorStepUpdate extends CreatorStepDraft {
  status: CreatorStepStatus;
  notes: string | null;
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

  artTypes(): Observable<CreatorArtType[]> {
    return this.http.get<CreatorArtType[]>(`${this.base}/art-types`);
  }

  createArtType(name: string, workflowId: number | null): Observable<CreatorArtType> {
    return this.http.post<CreatorArtType>(`${this.base}/art-types`, { name, workflowId });
  }

  updateArtType(id: number, name: string, workflowId: number | null): Observable<CreatorArtType> {
    return this.http.put<CreatorArtType>(`${this.base}/art-types/${id}`, { name, workflowId });
  }

  stageDefinitions(): Observable<CreatorStageDefinition[]> {
    return this.http.get<CreatorStageDefinition[]>(`${this.base}/stage-definitions`);
  }

  createStageDefinition(name: string): Observable<CreatorStageDefinition> {
    return this.http.post<CreatorStageDefinition>(`${this.base}/stage-definitions`, { name });
  }

  workflows(): Observable<CreatorWorkflow[]> {
    return this.http.get<CreatorWorkflow[]>(`${this.base}/workflows`);
  }

  createWorkflow(input: CreatorWorkflowDraft): Observable<CreatorWorkflow> {
    return this.http.post<CreatorWorkflow>(`${this.base}/workflows`, input);
  }

  updateWorkflow(id: number, input: CreatorWorkflowDraft): Observable<CreatorWorkflow> {
    return this.http.put<CreatorWorkflow>(`${this.base}/workflows/${id}`, input);
  }

  commissionSteps(id: number): Observable<CreatorCommissionStep[]> {
    return this.http.get<CreatorCommissionStep[]>(`${this.base}/commissions/${id}/steps`);
  }

  addCommissionStep(id: number, input: CreatorStepDraft): Observable<CreatorCommissionStep> {
    return this.http.post<CreatorCommissionStep>(`${this.base}/commissions/${id}/steps`, input);
  }

  copyWorkflowToCommission(id: number, workflowId: number): Observable<CreatorCommissionStep[]> {
    return this.http.post<CreatorCommissionStep[]>(
      `${this.base}/commissions/${id}/steps/from-workflow/${workflowId}`, {}
    );
  }

  updateCommissionStep(commissionId: number, id: number, input: CreatorStepUpdate):
    Observable<CreatorCommissionStep> {
    return this.http.put<CreatorCommissionStep>(
      `${this.base}/commissions/${commissionId}/steps/${id}`, input
    );
  }

  deleteCommissionStep(commissionId: number, id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/commissions/${commissionId}/steps/${id}`);
  }
}
