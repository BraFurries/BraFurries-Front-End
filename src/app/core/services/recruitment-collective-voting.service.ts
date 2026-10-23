import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { DecisionReceipt } from './recruitment-decision-desk.service';

export type BallotChoice = 'APPROVE' | 'REJECT';
export type VotingTiePolicy = 'REJECT_ON_TIE' | 'MANAGER_OVERRIDE';

export interface OwnRecruitmentBallot {
  id: number;
  applicationId: number;
  stageId: number;
  voterUserId: number;
  choice: BallotChoice;
  castAt: string;
}

export interface RecruitmentVoteTally {
  applicationId: number;
  stageId: number;
  approves: number;
  rejects: number;
  quorum: number;
  quorumReached: boolean;
  tie: boolean;
  tiePolicy: VotingTiePolicy;
}

export interface RecruitmentVotingDecision {
  receipt: DecisionReceipt;
  tally: RecruitmentVoteTally;
}

@Injectable({providedIn: 'root'})
export class RecruitmentCollectiveVotingService {
  constructor(private readonly http: HttpClient) {}

  mine(communityId: number, applicationId: number, stageId: number):
    Observable<OwnRecruitmentBallot> {
    return this.http.get<OwnRecruitmentBallot>(
      `${this.base(communityId,applicationId,stageId)}/mine`);
  }

  cast(communityId: number, applicationId: number, stageId: number,
       choice: BallotChoice): Observable<OwnRecruitmentBallot> {
    return this.http.post<OwnRecruitmentBallot>(
      `${this.base(communityId,applicationId,stageId)}/mine`, {choice});
  }

  tally(communityId: number, applicationId: number, stageId: number):
    Observable<RecruitmentVoteTally> {
    return this.http.get<RecruitmentVoteTally>(
      `${this.base(communityId,applicationId,stageId)}/tally`);
  }

  finalize(communityId: number, applicationId: number, stageId: number,
           override: {outcome: BallotChoice; reason: string} | null):
    Observable<RecruitmentVotingDecision> {
    return this.http.post<RecruitmentVotingDecision>(
      `${this.base(communityId,applicationId,stageId)}/finalize`, override);
  }

  private base(communityId: number, applicationId: number, stageId: number): string {
    return `${environment.apiBaseUrl}/user/me/communities/${communityId}/recruitment` +
      `/applications/${applicationId}/stages/${stageId}/votes`;
  }
}
