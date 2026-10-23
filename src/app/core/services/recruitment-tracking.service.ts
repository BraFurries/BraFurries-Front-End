import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

/** Public-facing status deliberately does not reveal internal decisions. */
export interface OwnRecruitmentApplication {
  id: number;
  processId: number;
  processTitle: string;
  submittedAt: string;
  publicStatus: 'RECEIVED';
}

export interface ReviewableRecruitmentProcess {
  id: number;
  title: string;
}

export interface ReviewQueueItem {
  id: number;
  processId: number;
  processVersionId: number;
  candidateUserId: number;
  processTitle: string;
  internalStatus: string;
  submittedAt: string;
}

export interface ReviewStage {
  stageId: number;
  position: number;
  publicName: string;
  stageType: string;
  internalStatus: string;
  enteredAt: string | null;
  completedAt: string | null;
}

/** Staff-only response: never pass it to candidate UI. */
export interface ReviewApplication {
  application: ReviewQueueItem;
  stages: ReviewStage[];
  submittedStageId: number | null;
  candidateAnswers: Record<string, unknown> | null;
}

export interface StaffReviewQuestion {
  id: string;
  label: string;
  type: 'SHORT_TEXT' | 'LONG_TEXT' | 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE'
    | 'YES_NO' | 'NUMBER' | 'SCALE' | 'DATE' | 'LINK' | 'CONSENT';
  required: boolean;
  options: { id: string; label: string }[];
  minValue: number | null;
  maxValue: number | null;
}

export interface StaffAssessmentForm {
  questions: StaffReviewQuestion[];
}

export interface OwnStaffAssessment {
  id: number;
  applicationId: number;
  stageId: number;
  evaluatorUserId: number;
  score: number | null;
  opinion: string | null;
  staffAnswers: Record<string, unknown> | null;
  submittedAt: string;
}

export interface SubmitStaffAssessment {
  score: number | null;
  opinion: string | null;
  staffAnswers: Record<string, unknown>;
}

@Injectable({ providedIn: 'root' })
export class RecruitmentTrackingService {
  constructor(private readonly http: HttpClient) {}

  mine(communityId: number, beforeId?: number): Observable<OwnRecruitmentApplication[]> {
    return this.http.get<OwnRecruitmentApplication[]>(
      `${this.base(communityId)}/mine`,
      { params: beforeId ? { beforeId: String(beforeId) } : {} }
    );
  }

  ownDetail(communityId: number, applicationId: number): Observable<OwnRecruitmentApplication> {
    return this.http.get<OwnRecruitmentApplication>(
      `${this.base(communityId)}/mine/${applicationId}`
    );
  }

  reviewProcesses(communityId: number): Observable<ReviewableRecruitmentProcess[]> {
    return this.http.get<ReviewableRecruitmentProcess[]>(
      `${this.base(communityId)}/review/processes`
    );
  }

  queue(communityId: number, processId: number, beforeId?: number): Observable<ReviewQueueItem[]> {
    let params = new HttpParams().set('processId', String(processId));
    if (beforeId) params = params.set('beforeId', String(beforeId));
    return this.http.get<ReviewQueueItem[]>(`${this.base(communityId)}/review`, { params });
  }

  reviewDetail(communityId: number, applicationId: number): Observable<ReviewApplication> {
    return this.http.get<ReviewApplication>(
      `${this.base(communityId)}/review/${applicationId}`
    );
  }

  assessmentForm(
    communityId: number, applicationId: number, stageId: number
  ): Observable<StaffAssessmentForm> {
    return this.http.get<StaffAssessmentForm>(
      `${this.reviewBase(communityId, applicationId, stageId)}/form`
    );
  }

  submitAssessment(
    communityId: number, applicationId: number, stageId: number,
    payload: SubmitStaffAssessment
  ): Observable<OwnStaffAssessment> {
    return this.http.post<OwnStaffAssessment>(
      `${this.reviewBase(communityId, applicationId, stageId)}/mine`, payload
    );
  }

  ownAssessment(
    communityId: number, applicationId: number, stageId: number
  ): Observable<OwnStaffAssessment> {
    return this.http.get<OwnStaffAssessment>(
      `${this.reviewBase(communityId, applicationId, stageId)}/mine`
    );
  }

  private reviewBase(communityId: number, applicationId: number, stageId: number): string {
    return `${environment.apiBaseUrl}/user/me/communities/${communityId}/recruitment` +
      `/applications/${applicationId}/stages/${stageId}/assessments`;
  }

  private base(communityId: number): string {
    return `${environment.apiBaseUrl}/user/me/communities/${communityId}/recruitment/applications`;
  }
}
