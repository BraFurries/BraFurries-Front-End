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
  it('never sends mutations for automatic objective stages or published versions', () => {
    component.stageType='AUTO_EVALUATION';
    component.savePolicy();
    component.stageType='APPLICATION';
    component.versionStatus='PUBLISHED';
    component.savePolicy();
    expect(api.save).not.toHaveBeenCalled();
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
