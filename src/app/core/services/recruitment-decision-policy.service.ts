import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type ReviewMode = 'INDIVIDUAL' | 'COLLECTIVE';
export type DecisionMode = 'MANUAL' | 'AUTOMATIC_VOTE';
export interface RecruitmentDecisionPolicy {
  reviewMode: ReviewMode;
  decisionMode: DecisionMode;
  minimumAssessments: number;
}
export interface StagePolicyResult {
  stageId: number;
  processId: number;
  stageType: string;
  versionStatus: 'DRAFT' | 'PUBLISHED' | 'SUPERSEDED';
  draftRevision: number;
  policy: RecruitmentDecisionPolicy;
}

@Injectable({ providedIn: 'root' })
export class RecruitmentDecisionPolicyService {
  constructor(private readonly http: HttpClient) {}
  get(communityId: number, processId: number, stageId: number): Observable<StagePolicyResult> {
    return this.http.get<StagePolicyResult>(this.base(communityId,processId,stageId));
  }
  save(communityId: number, processId: number, stageId: number,
       expectedRevision: number, policy: RecruitmentDecisionPolicy): Observable<StagePolicyResult> {
    return this.http.put<StagePolicyResult>(this.base(communityId,processId,stageId),{
      expectedRevision, policy
    });
  }
  private base(communityId: number, processId: number, stageId: number): string {
    return `${environment.apiBaseUrl}/user/me/communities/${communityId}/recruitment` +
      `/processes/${processId}/stages/${stageId}/decision-policy`;
  }
}
