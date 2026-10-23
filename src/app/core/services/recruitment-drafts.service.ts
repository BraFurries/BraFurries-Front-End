import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type RecruitmentStageType =
  'APPLICATION' | 'ANALYSIS' | 'HUMAN_EVALUATION' |
  'AUTO_EVALUATION' | 'INTERVIEW' | 'DECISION' | 'CUSTOM';

export type RecruitmentQuestionType =
  'SHORT_TEXT' | 'LONG_TEXT' | 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' |
  'YES_NO' | 'NUMBER' | 'SCALE' | 'DATE' | 'LINK' | 'CONSENT';

export interface RecruitmentOption {
  id: string;
  label: string;
}

export interface RecruitmentQuestion {
  id: string;
  label: string;
  type: RecruitmentQuestionType;
  required: boolean;
  options: RecruitmentOption[];
  minValue: number | null;
  maxValue: number | null;
  points: number | null;
  correctAnswers: string[];
}

export interface RecruitmentForm {
  questions: RecruitmentQuestion[];
}

export interface RecruitmentProcess {
  id: number;
  communityId: number;
  title: string;
  description: string | null;
  status: string;
  visibility: string;
  enrollmentStatus: string;
  draftVersion: number;
  draftRevision: number;
}

export interface RecruitmentStage {
  id: number;
  processId: number;
  processVersionId: number;
  position: number;
  internalName: string;
  publicName: string;
  stageType: RecruitmentStageType;
}

export interface RecruitmentDraft {
  process: RecruitmentProcess;
  stages: RecruitmentStage[];
}

/** Staff-only DTO; candidate-facing APIs must never return these fields. */
export interface RecruitmentStageDefinition {
  id: number;
  processId: number;
  versionId: number;
  position: number;
  internalName: string;
  publicName: string;
  stageType: RecruitmentStageType;
  candidateForm: RecruitmentForm | null;
  staffForm: RecruitmentForm | null;
  draftRevision: number;
}

export interface SaveRecruitmentStage {
  expectedRevision: number;
  internalName: string;
  publicName: string;
  stageType: RecruitmentStageType;
  candidateForm: RecruitmentForm | null;
  staffForm: RecruitmentForm | null;
}

/** Administrative configuration, never candidate-facing eligibility determination. */
export interface RecruitmentEligibility {
  minMembershipDays: number;
  requireVip: boolean;
  requirePartner: boolean;
}

export interface RecruitmentPublicationCheck {
  processId: number;
  processVersionId: number | null;
  draftRevision: number;
  ready: boolean;
  stageCount: number;
  blockers: string[];
  configuredEligibility: RecruitmentEligibility | null;
  configuredTermsText: string | null;
}

export interface RecruitmentPublicationResult {
  processId: number;
  versionId: number;
  draftRevision: number;
  processStatus: string;
  versionStatus: string;
  enrollmentStatus: string;
  visibility: string;
}

@Injectable({ providedIn: 'root' })
export class RecruitmentDraftsService {
  constructor(private readonly http: HttpClient) {}

  list(communityId: number): Observable<RecruitmentProcess[]> {
    return this.http.get<RecruitmentProcess[]>(this.processesUrl(communityId));
  }

  create(communityId: number, title: string, description: string | null): Observable<RecruitmentProcess> {
    return this.http.post<RecruitmentProcess>(this.processesUrl(communityId), { title, description });
  }

  detail(communityId: number, processId: number): Observable<RecruitmentDraft> {
    return this.http.get<RecruitmentDraft>(`${this.processesUrl(communityId)}/${processId}`);
  }

  updateProcess(communityId: number, processId: number, title: string,
                description: string | null, expectedRevision: number): Observable<RecruitmentProcess> {
    return this.http.put<RecruitmentProcess>(`${this.processesUrl(communityId)}/${processId}`, { title, description, expectedRevision });
  }

  appendStage(communityId: number, processId: number, internalName: string,
              publicName: string, stageType: RecruitmentStageType,
              expectedRevision: number): Observable<RecruitmentStage> {
    return this.http.post<RecruitmentStage>(this.stagesUrl(communityId, processId), {
      internalName, publicName, stageType, expectedRevision
    });
  }

  definition(communityId: number, processId: number, stageId: number): Observable<RecruitmentStageDefinition> {
    return this.http.get<RecruitmentStageDefinition>(
      `${this.stagesUrl(communityId, processId)}/${stageId}/definition`
    );
  }

  saveStage(communityId: number, processId: number, stageId: number,
            definition: SaveRecruitmentStage): Observable<RecruitmentStageDefinition> {
    return this.http.put<RecruitmentStageDefinition>(
      `${this.stagesUrl(communityId, processId)}/${stageId}/definition`, definition
    );
  }

  reorder(communityId: number, processId: number, stageIds: number[],
          expectedRevision: number): Observable<RecruitmentStage[]> {
    return this.http.put<RecruitmentStage[]>(
      `${this.stagesUrl(communityId, processId)}/order`, { stageIds, expectedRevision }
    );
  }

  removeStage(communityId: number, processId: number, stageId: number,
              expectedRevision: number): Observable<void> {
    return this.http.delete<void>(
      `${this.stagesUrl(communityId, processId)}/${stageId}`,
      { params: { expectedRevision: String(expectedRevision) } }
    );
  }

  previewPublication(communityId: number, processId: number): Observable<RecruitmentPublicationCheck> {
    return this.http.get<RecruitmentPublicationCheck>(
      `${this.processesUrl(communityId)}/${processId}/publication/preview`
    );
  }

  configureEligibility(communityId: number, processId: number,
                       expectedRevision: number,
                       eligibility: RecruitmentEligibility): Observable<RecruitmentPublicationCheck> {
    return this.http.put<RecruitmentPublicationCheck>(
      `${this.processesUrl(communityId)}/${processId}/publication/eligibility`,
      { expectedRevision, eligibility }
    );
  }

  publishProcess(communityId: number, processId: number,
                 expectedRevision: number): Observable<RecruitmentPublicationResult> {
    return this.http.post<RecruitmentPublicationResult>(
      `${this.processesUrl(communityId)}/${processId}/publication/publish`,
      { expectedRevision }
    );
  }

  configureTerms(communityId: number, processId: number,
                 expectedRevision: number, termsText: string): Observable<RecruitmentPublicationCheck> {
    return this.http.put<RecruitmentPublicationCheck>(
      `${this.processesUrl(communityId)}/${processId}/publication/terms`,
      { expectedRevision, termsText }
    );
  }

  openEnrollment(communityId: number, processId: number,
                 expectedRevision: number, endsAt: string): Observable<void> {
    return this.http.post<void>(
      `${this.processesUrl(communityId)}/${processId}/intake/open`,
      { expectedRevision, endsAt }
    );
  }

  private processesUrl(communityId: number): string {
    return `${environment.apiBaseUrl}/user/me/communities/${communityId}/recruitment/processes`;
  }

  private stagesUrl(communityId: number, processId: number): string {
    return `${this.processesUrl(communityId)}/${processId}/stages`;
  }
}
