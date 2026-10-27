import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface ExamFocusSignal {
  id:number;
  eventType:'FOCUS_LOST'|'COPY_PREVENTED';
  source:string;
  occurredAt:string;
}
export interface ExamReviewIncident {
  attemptId:number;
  status:'STARTED'|'BLOCKED'|'EXPIRED'|'SUBMITTED';
  focusLosses:number;
  originalExpiresAt:string;
  reinstatedAt:string|null;
  reinstatedUntil:string|null;
  reviewedByUserId:number|null;
  reviewReason:string|null;
}
export interface ExamIncidentEvidence {
  incident:ExamReviewIncident;
  signals:ExamFocusSignal[];
  truncated:boolean;
  recordedFocusSignals:number;
  canReinstate:boolean;
  appeal?:ExamAppeal|null;
}
export interface ExamReviewPanel {
  applicationId:number;
  stageId:number;
  incidents:ExamIncidentEvidence[];
}
export interface ExamAppeal {
  attemptId:number;
  applicationId:number;
  stageId:number;
  candidateUserId:number;
  reason:string;
  status:'PENDING'|'APPROVED'|'DENIED';
  requestedAt:string;
  reviewedByUserId:number|null;
  reviewReason:string|null;
  reviewedAt:string|null;
}
export interface CandidateAppealStatus {
  attemptId:number;
  status:'PENDING'|'APPROVED'|'DENIED';
  requestedAt:string;
}
export interface AppealDecision {
  attemptId:number;
  status:'DENIED';
}
export interface ExamReinstatement {
  applicationId:number;
  stageId:number;
  attemptId:number;
  expiresAt:string;
  previousFocusLosses:number;
  restored:boolean;
}

@Injectable({providedIn:'root'})
export class RecruitmentExamReviewService {
  constructor(private readonly http:HttpClient) {}
  panel(communityId:number,applicationId:number,stageId:number):Observable<ExamReviewPanel> {
    return this.http.get<ExamReviewPanel>(this.base(communityId,applicationId,stageId));
  }
  reinstate(communityId:number,applicationId:number,stageId:number,
    attemptId:number,reason:string):Observable<ExamReinstatement> {
    return this.http.post<ExamReinstatement>(
      `${this.base(communityId,applicationId,stageId)}/attempts/${attemptId}/reinstate`,
      {reason});
  }
  candidateAppeal(communityId:number,applicationId:number,stageId:number,
    attemptId:number,reason:string):Observable<ExamAppeal> {
    return this.http.post<ExamAppeal>(
      `${this.base(communityId,applicationId,stageId)}/attempts/${attemptId}/appeal`,
      {reason});
  }
  candidateAppealStatus(communityId:number,applicationId:number,stageId:number,
    attemptId:number):Observable<CandidateAppealStatus> {
    return this.http.get<CandidateAppealStatus>(
      `${this.base(communityId,applicationId,stageId)}/attempts/${attemptId}/appeal`);
  }
  denyAppeal(communityId:number,applicationId:number,stageId:number,
    attemptId:number,reason:string):Observable<AppealDecision> {
    return this.http.post<AppealDecision>(
      `${this.base(communityId,applicationId,stageId)}/attempts/${attemptId}/appeal/deny`,
      {reason});
  }
  private base(communityId:number,applicationId:number,stageId:number):string {
    return `${environment.apiBaseUrl}/user/me/communities/${communityId}`+
      `/recruitment/applications/${applicationId}/stages/${stageId}/integrity-review`;
  }
}
