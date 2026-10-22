import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface RecruitmentReviewableStage {
  stageId: number;
  processId: number;
  processVersionId: number;
  versionNumber: number;
  versionStatus: string;
  position: number;
  publicName: string;
  stageType: string;
}

export interface RecruitmentReviewerAssignment {
  id: number;
  stageId: number;
  userId: number | null;
  roleId: number | null;
}

@Injectable({ providedIn: 'root' })
export class RecruitmentReviewerAssignmentsService {
  constructor(private readonly http: HttpClient) {}

  stages(communityId: number, processId: number): Observable<RecruitmentReviewableStage[]> {
    return this.http.get<RecruitmentReviewableStage[]>(
      `${this.base(communityId)}/processes/${processId}/reviewer-stages`
    );
  }

  list(communityId: number, stageId: number): Observable<RecruitmentReviewerAssignment[]> {
    return this.http.get<RecruitmentReviewerAssignment[]>(
      `${this.base(communityId)}/stages/${stageId}/reviewers`
    );
  }

  assign(
    communityId: number, stageId: number,
    request: {userId: number | null; roleId: number | null}
  ): Observable<RecruitmentReviewerAssignment> {
    return this.http.post<RecruitmentReviewerAssignment>(
      `${this.base(communityId)}/stages/${stageId}/reviewers`, request
    );
  }

  revoke(communityId: number, stageId: number, assignmentId: number): Observable<void> {
    return this.http.delete<void>(
      `${this.base(communityId)}/stages/${stageId}/reviewers/${assignmentId}`
    );
  }

  private base(communityId: number): string {
    return `${environment.apiBaseUrl}/user/me/communities/${communityId}/recruitment`;
  }
}
