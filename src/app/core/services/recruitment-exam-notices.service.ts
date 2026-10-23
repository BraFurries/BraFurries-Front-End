import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface RecruitmentExamNotice {
  id: number;
  applicationId: number;
  stageId: number;
  attemptId: number;
  eventType: 'BLOCKED' | 'REINSTATED';
  occurredAt: string;
  newExpiresAt: string | null;
  read: boolean;
}

/** Scoped, private in-app notices; no polling, push or external messaging. */
@Injectable({providedIn:'root'})
export class RecruitmentExamNoticesService {
  constructor(private readonly http: HttpClient) {}

  candidate(communityId:number,applicationId:number):Observable<RecruitmentExamNotice[]> {
    return this.http.get<RecruitmentExamNotice[]>(this.candidateUrl(communityId,applicationId));
  }
  candidateRead(communityId:number,applicationId:number,noticeId:number):Observable<void> {
    return this.http.post<void>(
      `${this.candidateUrl(communityId,applicationId)}/${noticeId}/read`,{});
  }

  staff(communityId:number,processId:number):Observable<RecruitmentExamNotice[]> {
    return this.http.get<RecruitmentExamNotice[]>(this.staffUrl(communityId,processId));
  }
  staffRead(communityId:number,processId:number,noticeId:number):Observable<void> {
    return this.http.post<void>(
      `${this.staffUrl(communityId,processId)}/${noticeId}/read`,{});
  }

  private candidateUrl(communityId:number,applicationId:number):string {
    return `${environment.apiBaseUrl}/user/me/communities/${communityId}/recruitment/applications/${applicationId}/exam-notices`;
  }
  private staffUrl(communityId:number,processId:number):string {
    return `${environment.apiBaseUrl}/user/me/communities/${communityId}/recruitment/processes/${processId}/exam-notices`;
  }
}
