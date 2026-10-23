import { of, Subject, throwError } from 'rxjs';
import {
  RecruitmentDecisionPolicyService, StagePolicyResult
} from '../../../core/services/recruitment-decision-policy.service';
import { RecruitmentStagePolicyComponent } from './recruitment-stage-policy.component';

describe('RecruitmentStagePolicyComponent', () => {
  let api: jasmine.SpyObj<RecruitmentDecisionPolicyService>;
  let component: RecruitmentStagePolicyComponent;
  const response: StagePolicyResult = {
    stageId: 501, processId: 70, stageType: 'APPLICATION',
    versionStatus: 'DRAFT', draftRevision: 4,
    policy: {reviewMode:'COLLECTIVE', decisionMode:'MANUAL', minimumAssessments:2}
  };
  beforeEach(() => {
    api = jasmine.createSpyObj('RecruitmentDecisionPolicyService',['get','save']);
    api.get.and.returnValue(of(response));
    api.save.and.returnValue(of({...response,draftRevision:5}));
    component = new RecruitmentStagePolicyComponent(api);
    component.communityId=11;
    component.processId=70;
    component.stageId=501;
    component.expectedRevision=4;
    component.stageType='APPLICATION';
    component.editable=true;
    component.ngOnChanges();
  });
  afterEach(() => component.ngOnDestroy());

  it('loads current Community versioned policy', () => {
    expect(api.get).toHaveBeenCalledOnceWith(11,70,501);
    expect(component.policy.minimumAssessments).toBe(2);
  });
  it('forces one assessment for individual, minimum two for collective', () => {
    component.changeMode('INDIVIDUAL');
    expect(component.policy.minimumAssessments).toBe(1);
    component.changeMode('COLLECTIVE');
    expect(component.policy.minimumAssessments).toBe(2);
    component.policy.minimumAssessments=1;
    expect(component.canSave).toBeFalse();
  });
  it('saves expected revision and emits backend revision only after success', () => {
    const saved=jasmine.createSpy('saved');
    component.saved.subscribe(saved);
    component.policy.minimumAssessments=3;
    component.savePolicy();
    expect(api.save).toHaveBeenCalledOnceWith(11,70,501,4,
      {reviewMode:'COLLECTIVE',decisionMode:'MANUAL',minimumAssessments:3});
    expect(saved).toHaveBeenCalledOnceWith(5);
  });
  it('requires explicit quorum and tie policy for an automatic vote', () => {
    component.changeDecisionMode('AUTOMATIC_VOTE');
    expect(component.policy.reviewMode).toBe('COLLECTIVE');
    expect(component.policy.minimumVotes).toBe(2);
    expect(component.policy.tiePolicy).toBe('MANAGER_OVERRIDE');
    expect(component.canSave).toBeTrue();
    component.policy.minimumVotes=1;
    expect(component.canSave).toBeFalse();
    component.policy.minimumVotes=3;
    component.policy.tiePolicy=null;
    expect(component.canSave).toBeFalse();
    component.policy.tiePolicy='REJECT_ON_TIE';
    component.policy.minimumAssessments=2;
    expect(component.canSave).toBeTrue();
    component.savePolicy();
    expect(api.save).toHaveBeenCalledWith(11,70,501,4, {
      reviewMode:'COLLECTIVE',decisionMode:'AUTOMATIC_VOTE',
      minimumAssessments:2,minimumVotes:3,tiePolicy:'REJECT_ON_TIE'
    });
  });
  it('does not carry quorum and tie fields into manual policies', () => {
    component.changeDecisionMode('AUTOMATIC_VOTE');
    component.changeDecisionMode('MANUAL');
    expect(component.policy.minimumVotes).toBeNull();
    expect(component.policy.tiePolicy).toBeNull();
    expect(component.canSave).toBeTrue();
  });

  it('never sends mutations for automatic objective stages or published versions', () => {
    component.stageType='AUTO_EVALUATION';
    component.savePolicy();
    component.stageType='APPLICATION';
    component.versionStatus='PUBLISHED';
    component.savePolicy();
    expect(api.save).not.toHaveBeenCalled();
  });
  it('preserves unsaved edits when parent revision or editable flag changes', () => {
    component.policy.minimumAssessments=5;
    component.expectedRevision=5;
    component.editable=false;
    component.ngOnChanges();
    expect(component.policy.minimumAssessments).toBe(5);
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it('clears state and ignores late responses after switching Community', () => {
    const delayed=new Subject<StagePolicyResult>();
    api.get.and.returnValue(delayed);
    component.communityId=12;
    component.ngOnChanges();
    expect(component.policy.reviewMode).toBe('INDIVIDUAL');
    component.communityId=null;
    component.ngOnChanges();
    delayed.next(response);
    expect(component.policy.reviewMode).toBe('INDIVIDUAL');
    expect(component.error).toBe('');
  });
  it('handles conflicts without claiming save succeeded', () => {
    api.save.and.returnValue(throwError(() => ({status:409})));
    const saved=jasmine.createSpy('saved');
    component.saved.subscribe(saved);
    component.savePolicy();
    expect(component.error).toContain('desatualizado');
    expect(saved).not.toHaveBeenCalled();
  });
});
