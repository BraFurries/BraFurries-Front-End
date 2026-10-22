import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface CandidateOpenProcess {
  id: number;
  title: string;
  description: string | null;
  enrollmentEndsAt: string;
}

export interface CandidateOption { id: string; label: string; }

export interface CandidateQuestion {
  id: string;
  label: string;
  type: 'SHORT_TEXT' | 'LONG_TEXT' | 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' |
    'YES_NO' | 'NUMBER' | 'SCALE' | 'DATE' | 'LINK' | 'CONSENT';
  required: boolean;
  options: CandidateOption[];
  minValue: number | null;
  maxValue: number | null;
}

export interface CandidateApplicationForm {
  process: CandidateOpenProcess;
  publishedVersionId: number;
  firstStageId: number;
  form: { questions: CandidateQuestion[] };
  termsText: string;
  termsHash: string;
  eligible: boolean;
  eligibilityBlockers: string[];
}

export interface SubmittedApplication {
  applicationId: number;
  publishedVersionId: number;
  status: string;
  submittedAt: string;
}

/** Candidate-only API with redacted, publicly approved question definitions. */
@Injectable({ providedIn: 'root' })
export class RecruitmentCandidatesService {
  constructor(private readonly http: HttpClient) {}

  list(communityId: number): Observable<CandidateOpenProcess[]> {
    return this.http.get<CandidateOpenProcess[]>(this.base(communityId));
  }

  form(communityId: number, processId: number): Observable<CandidateApplicationForm> {
    return this.http.get<CandidateApplicationForm>(
      `${this.base(communityId)}/${processId}`
    );
  }

  submit(communityId: number, processId: number, termsHash: string,
         answers: Record<string, unknown>): Observable<SubmittedApplication> {
    return this.http.post<SubmittedApplication>(
      `${this.base(communityId)}/${processId}/apply`, { termsHash, answers }
    );
  }

  private base(communityId: number): string {
    return `${environment.apiBaseUrl}/user/me/communities/${communityId}/recruitment/open`;
  }
}
