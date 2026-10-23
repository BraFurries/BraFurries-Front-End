import { of, Subject, throwError } from 'rxjs';
import {
  RecruitmentCollectiveVotingService, RecruitmentVoteTally,
  RecruitmentVotingDecision
} from '../../../core/services/recruitment-collective-voting.service';
import { RecruitmentVoteTallyComponent } from './recruitment-vote-tally.component';

describe('RecruitmentVoteTallyComponent', () => {
  let api: jasmine.SpyObj<RecruitmentCollectiveVotingService>;
  let component: RecruitmentVoteTallyComponent;
  const tally: RecruitmentVoteTally = {
    applicationId:100,stageId:501,approves:3,rejects:1,quorum:3,
    quorumReached:true,tie:false,tiePolicy:'MANAGER_OVERRIDE'
  };
  const decision: RecruitmentVotingDecision = {
    receipt: {
      decision: {id:999,applicationId:100,stageId:501,
        decidedByUserId:77,outcome:'APPROVE',reason:null,decidedAt:'2026-10-23T12:00:00Z'},
      applicationStatus:'AWAITING_PUBLICATION',
      nextStageId:null,nextStageStatus:null
    },
    tally
  };

  beforeEach(() => {
    api=jasmine.createSpyObj('RecruitmentCollectiveVotingService',
      ['mine','cast','tally','finalize']);
    api.tally.and.returnValue(of({...tally}));
    api.finalize.and.returnValue(of(decision));
    component=new RecruitmentVoteTallyComponent(api);
    component.communityId=11;
    component.applicationId=100;
    component.stageId=501;
    component.stageStatus='AWAITING_REVIEW';
    component.applicationStatus='IN_PROGRESS';
    component.assessmentCount=3;
    component.policy={
      reviewMode:'COLLECTIVE',decisionMode:'AUTOMATIC_VOTE',
      minimumAssessments:2,minimumVotes:3,tiePolicy:'MANAGER_OVERRIDE'
    };
    component.ngOnChanges();
  });
  afterEach(() => component.ngOnDestroy());

  it('loads management-only tallies and never fetches individual ballot identity', () => {
    expect(api.tally).toHaveBeenCalledOnceWith(11,100,501);
    expect(api.mine).not.toHaveBeenCalled();
    expect(api.cast).not.toHaveBeenCalled();
    expect(component.canFinalize).toBeTrue();
    expect(component.canSubmit).toBeFalse();
  });

  it('requires explicit confirmation for server-computed majority', () => {
    const completed=jasmine.createSpy('completed');
    component.completed.subscribe(completed);
    component.confirmed=true;
    component.finalize();
    expect(api.finalize).toHaveBeenCalledOnceWith(11,100,501,null);
    expect(completed).toHaveBeenCalledOnceWith(decision);
    expect(component.tally).toBeNull();
    expect(component.confirmed).toBeFalse();
  });

  it('refuses insufficient quorum, incomplete evidence or insufficient assessments', () => {
    component.tally={...tally,approves:1,rejects:1,quorumReached:false,tie:true};
    component.confirmed=true;
    expect(component.canSubmit).toBeFalse();
    component.tally={...tally};
    component.evidenceTruncated=true;
    expect(component.canSubmit).toBeFalse();
    component.evidenceTruncated=false;
    component.assessmentCount=1;
    expect(component.canSubmit).toBeFalse();
    component.finalize();
    expect(api.finalize).not.toHaveBeenCalled();
  });

  it('forces a written manager override in a tied vote', () => {
    component.tally={...tally,approves:2,rejects:2,tie:true};
    component.confirmed=true;
    expect(component.canSubmit).toBeFalse();
    component.overrideOutcome='REJECT';
    component.overrideReason='curto';
    expect(component.canSubmit).toBeFalse();
    component.overrideReason='Justificativa consistente';
    expect(component.canSubmit).toBeTrue();
    component.finalize();
    expect(api.finalize).toHaveBeenCalledOnceWith(11,100,501,{
      outcome:'REJECT',reason:'Justificativa consistente'
    });
  });

  it('allows configured automatic rejection in a tie without overriding the vote', () => {
    component.tally={...tally,approves:2,rejects:2,tie:true,tiePolicy:'REJECT_ON_TIE'};
    component.policy={...component.policy!,tiePolicy:'REJECT_ON_TIE'};
    component.confirmed=true;
    expect(component.canSubmit).toBeTrue();
    component.finalize();
    expect(api.finalize).toHaveBeenCalledOnceWith(11,100,501,null);
  });

  it('cannot finalize with stale or inconsistent policy', () => {
    component.policy={...component.policy!,minimumVotes:4};
    component.confirmed=true;
    expect(component.canSubmit).toBeFalse();
    component.policy={...component.policy!,minimumVotes:3};
    component.stageStatus='COMPLETED';
    expect(component.canSubmit).toBeFalse();
  });

  it('discards sensitive aggregate state when Community changes', () => {
    const pending=new Subject<RecruitmentVoteTally>();
    api.tally.and.returnValue(pending);
    component.communityId=12;
    component.ngOnChanges();
    component.communityId=null;
    component.ngOnChanges();
    pending.next(tally);
    expect(component.tally).toBeNull();
    expect(component.confirmed).toBeFalse();
  });

  it('resets stale quorum and confirmation after conflict', () => {
    api.finalize.and.returnValue(throwError(() => ({status:409})));
    component.confirmed=true;
    component.finalize();
    expect(component.tally).toBeNull();
    expect(component.confirmed).toBeFalse();
    expect(component.error).toContain('alterados');
  });
});
