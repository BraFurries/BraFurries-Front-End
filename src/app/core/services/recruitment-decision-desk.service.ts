import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { RecruitmentDecisionPolicy } from './recruitment-decision-policy.service';

/** Never use these privileged DTOs in candidate or reviewer-facing views. */
export interface DecisionQueueItem {
  id: number;
  processId: number;
  processVersionId: number;
  candidateUserId: number;
  processTitle: string;
  internalStatus: string;
  submittedAt: string;
}
export interface DecisionStageSummary {
  stageId: number;
  position: number;
  publicName: string;
  stageType: string;
  internalStatus: string;
  assessmentCount: number;
  policy: RecruitmentDecisionPolicy;
  decisionOutcome: 'APPROVE' | 'REJECT' | null;
  decisionReason: string | null;
  decidedByUserId: number | null;
  decidedAt: string | null;
}
export interface DecisionApplicationDetail {
  application: DecisionQueueItem;
  stages: DecisionStageSummary[];
  candidateAnswers: Record<string, unknown> | null;
}
export interface DecisionAssessment {
  id: number;
  evaluatorUserId: number;
  score: number | null;
  opinion: string | null;
  staffAnswers: Record<string, unknown> | null;
  submittedAt: string;
}
export interface DecisionStageEvidence {
  stage: DecisionStageSummary;
  assessments: DecisionAssessment[];
  truncated: boolean;
}
export interface DecisionReceipt {
  decision: {
    id: number; applicationId: number; stageId: number;
    decidedByUserId: number; outcome: 'APPROVE' | 'REJECT';
    reason: string | null; decidedAt: string;
  };
  applicationStatus: string;
  nextStageId: number | null;
  nextStageStatus: string | null;
}

@Injectable({providedIn:'root'})
export class RecruitmentDecisionDeskService {
  constructor(private readonly http: HttpClient) {}

  queue(communityId: number,processId: number,beforeId?: number): Observable<DecisionQueueItem[]> {
    let params=new HttpParams();
    if (beforeId) params=params.set('beforeId',String(beforeId));
    return this.http.get<DecisionQueueItem[]>(
      `${this.base(communityId,processId)}/queue`,{params});
  }

  detail(communityId: number,processId: number,
         applicationId: number): Observable<DecisionApplicationDetail> {
    return this.http.get<DecisionApplicationDetail>(
      `${this.base(communityId,processId)}/applications/${applicationId}`);
  }

  evidence(communityId: number,processId: number,applicationId: number,
           stageId: number): Observable<DecisionStageEvidence> {
    return this.http.get<DecisionStageEvidence>(
      `${this.base(communityId,processId)}/applications/${applicationId}`+
      `/stages/${stageId}/evidence`);
  }

  decide(communityId: number,applicationId: number,stageId: number,
         outcome: 'APPROVE'|'REJECT',reason: string|null): Observable<DecisionReceipt> {
    return this.http.post<DecisionReceipt>(
      `${environment.apiBaseUrl}/user/me/communities/${communityId}/recruitment`+
      `/applications/${applicationId}/stages/${stageId}/decision`,
      {outcome,reason});
  }

  private base(communityId: number,processId: number): string {
    return `${environment.apiBaseUrl}/user/me/communities/${communityId}/recruitment`+
      `/processes/${processId}/decisions`;
  }
}
