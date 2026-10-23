import { of, Subject, throwError } from 'rxjs';
import {
  OwnRecruitmentBallot, RecruitmentCollectiveVotingService,
  RecruitmentVotingAvailability
} from '../../../core/services/recruitment-collective-voting.service';
import { RecruitmentOwnBallotComponent } from './recruitment-own-ballot.component';

describe('RecruitmentOwnBallotComponent', () => {
  let voting: jasmine.SpyObj<RecruitmentCollectiveVotingService>;
  let component: RecruitmentOwnBallotComponent;
  const ballot: OwnRecruitmentBallot = {
    id:900,applicationId:100,stageId:501,voterUserId:77,
    choice:'APPROVE',castAt:'2026-10-23T10:00:00Z'
  };

  beforeEach(() => {
    voting = jasmine.createSpyObj('RecruitmentCollectiveVotingService',
      ['availability','mine','cast','tally','finalize']);
    voting.availability.and.returnValue(of({
      enabled:true,hasAssessment:true,alreadyVoted:false
    }));
    voting.mine.and.returnValue(of(ballot));
    voting.cast.and.returnValue(of(ballot));
    component = new RecruitmentOwnBallotComponent(voting);
    component.communityId=11;
    component.applicationId=100;
    component.stageId=501;
    component.stageStatus='AWAITING_REVIEW';
    component.assessmentSubmitted=true;
    component.ngOnChanges();
  });
  afterEach(() => component.ngOnDestroy());

  it('queries only the own ballot and never the aggregate or anyone else', () => {
    expect(voting.availability).toHaveBeenCalledOnceWith(11,100,501);
    expect(voting.mine).not.toHaveBeenCalled();
    expect(voting.tally).not.toHaveBeenCalled();
    expect(voting.finalize).not.toHaveBeenCalled();
    expect(component.ballot).toBeNull();
    expect(component.error).toBe('');
  });

  it('requires submitted assessment and deliberate vote confirmation', () => {
    component.assessmentSubmitted=false;
    component.ngOnChanges();
    component.confirmed=true;
    expect(component.canCast).toBeFalse();
    component.cast();
    expect(voting.cast).not.toHaveBeenCalled();
    component.assessmentSubmitted=true;
    component.ngOnChanges();
    expect(component.canCast).toBeFalse();
    component.confirmed=true;
    expect(component.canCast).toBeTrue();
  });

  it('submits a single private ballot, never a final decision', () => {
    component.choice='APPROVE';
    component.confirmed=true;
    component.cast();
    expect(voting.cast).toHaveBeenCalledOnceWith(11,100,501,'APPROVE');
    expect(component.ballot).toEqual(ballot);
    expect(component.confirmed).toBeFalse();
    expect(component.notice).toContain('Nenhuma decisão');
    component.confirmed=true;
    component.cast();
    expect(voting.cast).toHaveBeenCalledTimes(1);
    expect(voting.finalize).not.toHaveBeenCalled();
  });

  it('does not claim a vote was saved after a conflict', () => {
    voting.cast.and.returnValue(throwError(() => ({status:409})));
    component.confirmed=true;
    component.cast();
    expect(component.ballot).toBeNull();
    expect(component.error).toContain('Votação indisponível');
    expect(component.confirmed).toBeFalse();
  });

  it('clears private vote on Community switch and ignores late responses', () => {
    const pending = new Subject<RecruitmentVotingAvailability>();
    voting.availability.and.returnValue(pending);
    component.communityId=12;
    component.ngOnChanges();
    component.communityId=null;
    component.ngOnChanges();
    pending.next({enabled:true,hasAssessment:true,alreadyVoted:false});
    expect(component.ballot).toBeNull();
    expect(component.choice).toBe('APPROVE');
  });

  it('hides the entire voting form in manual-only stages', () => {
    voting.availability.and.returnValue(of({
      enabled:false,hasAssessment:false,alreadyVoted:false
    }));
    component.stageId=502;
    component.ngOnChanges();
    expect(component.available).toBeFalse();
    component.confirmed=true;
    expect(component.canCast).toBeFalse();
    component.cast();
    expect(voting.cast).not.toHaveBeenCalled();
  });

  it('does not offer voting in a completed or not-yet-ready stage', () => {
    component.stageStatus='COMPLETED';
    component.confirmed=true;
    expect(component.canCast).toBeFalse();
  });

  it('drops its saved ballot on destroy', () => {
    voting.availability.and.returnValue(of({
      enabled:true,hasAssessment:true,alreadyVoted:true
    }));
    voting.mine.and.returnValue(of(ballot));
    component.stageId=502;
    component.ngOnChanges();
    expect(component.ballot).toEqual(ballot);
    component.ngOnDestroy();
    expect(component.ballot).toBeNull();
  });
});
