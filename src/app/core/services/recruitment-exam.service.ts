import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface CandidateExam {
  applicationId: number;
  stageId: number;
  publicName: string;
  blocked: boolean;
}
export interface ExamQuestion {
  id: string;
  label: string;
  type: 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'YES_NO' | 'NUMBER' | 'SCALE';
  required: boolean;
  options: {id: string; label: string}[];
  minValue: number | null;
  maxValue: number | null;
}
export interface ExamSession {
  attemptId: number;
  applicationId: number;
  stageId: number;
  attemptNumber: number;
  status: 'STARTED';
  expiresAt: string;
  serverNow: string;
  form: {questions: ExamQuestion[]};
  maxFocusLosses: number | null;
  blockCopy: boolean;
  focusLosses: number;
}
export interface ExamIntegrityReceipt {
  eventId: string;
  status: 'STARTED' | 'BLOCKED';
  focusLosses: number;
  maxFocusLosses: number | null;
  blocked: boolean;
}
export type ExamIntegrityType = 'FOCUS_LOST' | 'COPY_PREVENTED';
export type ExamIntegritySource =
  'TAB_HIDDEN' | 'WINDOW_BLUR' | 'COPY' | 'CUT' | 'CONTEXT_MENU';

export interface ExamNumericScore {
  attemptId: number;
  earnedPoints: number;
  possiblePoints: number;
  percentage: number;
}
export interface ExamSubmissionReceipt {
  attemptId: number;
  applicationId: number;
  stageId: number;
  status: 'SUBMITTED';
  submittedAt: string;
  score: ExamNumericScore | null;
}

export interface AttemptPolicy {
  maxAttempts: number;
  timeLimitSeconds: number;
  deadlineAt: string | null;
  hardDeadline: boolean;
  maxFocusLosses: number | null;
  blockCopy: boolean;
}
export interface GradePolicy {
  passingPercentage: number;
  resultStrategy: 'BEST' | 'LAST';
  scoreVisibility: 'PRIVATE' | 'AFTER_SUBMISSION';
}
export interface AttemptPolicyResponse {
  stageId: number;
  versionId: number;
  draftRevision: number;
  policy: AttemptPolicy;
}
export interface GradePolicyResponse {
  processVersionId: number;
  stageId: number;
  revision: number;
  policy: GradePolicy;
}

@Injectable({providedIn:'root'})
export class RecruitmentExamService {
  constructor(private readonly http: HttpClient) {}

  currentExams(communityId: number, applicationId: number): Observable<CandidateExam[]> {
    return this.http.get<CandidateExam[]>(
      `${this.base(communityId,applicationId)}/exams`);
  }
  start(communityId: number, applicationId: number, stageId: number):
    Observable<ExamSession> {
    return this.http.post<ExamSession>(
      `${this.attempts(communityId,applicationId,stageId)}/start`, {});
  }
  submit(communityId: number, applicationId: number, stageId: number,
         attemptId: number, answers: Record<string, unknown>): Observable<ExamSubmissionReceipt> {
    return this.http.post<ExamSubmissionReceipt>(
      `${this.attempts(communityId,applicationId,stageId)}/${attemptId}/submit`,
      {answers});
  }
  integrityEvent(communityId: number, applicationId: number, stageId: number,
    attemptId: number, eventId: string, eventType: ExamIntegrityType,
    source: ExamIntegritySource): Observable<ExamIntegrityReceipt> {
    return this.http.post<ExamIntegrityReceipt>(
      `${this.attempts(communityId,applicationId,stageId)}/${attemptId}/integrity-events`,
      {eventId,eventType,source});
  }
  ownScores(communityId: number, applicationId: number, stageId: number):
    Observable<ExamNumericScore[]> {
    return this.http.get<ExamNumericScore[]>(
      `${this.attempts(communityId,applicationId,stageId)}/scores`);
  }
  attemptPolicy(communityId: number, processId: number, stageId: number):
    Observable<AttemptPolicyResponse> {
    return this.http.get<AttemptPolicyResponse>(
      `${this.admin(communityId,processId,stageId)}/attempt-policy`);
  }
  saveAttemptPolicy(communityId: number, processId: number, stageId: number,
      expectedRevision: number, policy: AttemptPolicy): Observable<AttemptPolicyResponse> {
    return this.http.put<AttemptPolicyResponse>(
      `${this.admin(communityId,processId,stageId)}/attempt-policy`,
      {expectedRevision,...policy});
  }
  gradePolicy(communityId: number, processId: number, stageId: number):
    Observable<GradePolicyResponse> {
    return this.http.get<GradePolicyResponse>(
      `${this.admin(communityId,processId,stageId)}/grade-policy`);
  }
  saveGradePolicy(communityId: number, processId: number, stageId: number,
      expectedRevision: number, policy: GradePolicy): Observable<GradePolicyResponse> {
    return this.http.put<GradePolicyResponse>(
      `${this.admin(communityId,processId,stageId)}/grade-policy`,
      {expectedRevision,...policy});
  }

  private base(communityId:number,applicationId:number): string {
    return `${environment.apiBaseUrl}/user/me/communities/${communityId}/recruitment/applications/${applicationId}`;
  }
  private attempts(communityId:number,applicationId:number,stageId:number): string {
    return `${this.base(communityId,applicationId)}/stages/${stageId}/attempts`;
  }
  private admin(communityId:number,processId:number,stageId:number): string {
    return `${environment.apiBaseUrl}/user/me/communities/${communityId}/recruitment/processes/${processId}/stages/${stageId}`;
  }
}
