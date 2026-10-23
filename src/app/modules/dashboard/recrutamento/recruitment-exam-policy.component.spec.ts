import { of, Subject, throwError } from 'rxjs';
import { RecruitmentExamService } from '../../../core/services/recruitment-exam.service';
import { RecruitmentExamPolicyComponent } from './recruitment-exam-policy.component';

describe('RecruitmentExamPolicyComponent',()=>{
  let api:jasmine.SpyObj<RecruitmentExamService>;
  let component:RecruitmentExamPolicyComponent;
  beforeEach(()=>{
    api=jasmine.createSpyObj('RecruitmentExamService',
      ['currentExams','start','submit','ownScores','attemptPolicy',
       'saveAttemptPolicy','gradePolicy','saveGradePolicy']);
    api.attemptPolicy.and.returnValue(throwError(()=>({status:404})));
    api.gradePolicy.and.returnValue(throwError(()=>({status:404})));
    component=new RecruitmentExamPolicyComponent(api);
    component.communityId=11;component.processId=70;
    component.stageId=501;component.stageType='AUTO_EVALUATION';
    component.editable=true;component.expectedRevision=4;
    component.ngOnChanges();
  });
  afterEach(()=>component.ngOnDestroy());

  it('defaults numeric score disclosure to PRIVATE and disabled grading until attempts exist',()=>{
    expect(component.grade.scoreVisibility).toBe('PRIVATE');
    expect(component.grade.passingPercentage).toBe(70);
    expect(component.canSaveGrade).toBeFalse();
    expect(component.canSaveAttempt).toBeTrue();
  });

  it('saves attempt policy with optimistic revision before grading',()=>{
    const save=jasmine.createSpy('saved');
    component.saved.subscribe(save);
    api.saveAttemptPolicy.and.returnValue(of({
      stageId:501,versionId:80,draftRevision:5,policy:{...component.attempt}
    }));
    component.saveAttempts();
    expect(api.saveAttemptPolicy).toHaveBeenCalledWith(11,70,501,4,
      jasmine.objectContaining({maxAttempts:1,hardDeadline:true,blockCopy:false}));
    expect(component.attemptConfigured).toBeTrue();
    expect(save).toHaveBeenCalledOnceWith(5);
    expect(component.expectedRevision).toBe(5);
  });

  it('can opt into AFTER_SUBMISSION without publishing final selection result',()=>{
    component.attemptConfigured=true;
    component.grade.scoreVisibility='AFTER_SUBMISSION';
    api.saveGradePolicy.and.returnValue(of({
      processVersionId:80,stageId:501,revision:5,policy:{...component.grade}
    }));
    const saved=jasmine.createSpy('saved');
    component.saved.subscribe(saved);
    component.saveGrades();
    expect(api.saveGradePolicy).toHaveBeenCalledOnceWith(11,70,501,4,
      jasmine.objectContaining({passingPercentage:70,resultStrategy:'BEST',
        scoreVisibility:'AFTER_SUBMISSION'}));
    expect(saved).toHaveBeenCalledOnceWith(5);
  });

  it('never saves in a published or non-objective stage',()=>{
    component.editable=false;
    component.saveAttempts();component.saveGrades();
    expect(api.saveAttemptPolicy).not.toHaveBeenCalled();
    expect(api.saveGradePolicy).not.toHaveBeenCalled();
    component.stageType='HUMAN_EVALUATION';component.editable=true;
    component.ngOnChanges();
    expect(component.canSaveAttempt).toBeFalse();
  });

  it('rejects invalid score visibility and cutoff locally',()=>{
    component.attemptConfigured=true;
    component.grade.scoreVisibility='AFTER_SUBMISSION';
    component.grade.passingPercentage=0;
    expect(component.canSaveGrade).toBeFalse();
    component.grade.passingPercentage=70.001;
    expect(component.canSaveGrade).toBeFalse();
    component.grade.passingPercentage=70;
    expect(component.canSaveGrade).toBeTrue();
  });

  it('drops late manager policy data after tenant switch',()=>{
    const pending=new Subject<{
      stageId:number;versionId:number;draftRevision:number;
      policy:{maxAttempts:number;timeLimitSeconds:number;deadlineAt:string|null;
        hardDeadline:boolean;maxFocusLosses:null;blockCopy:boolean}
    }>();
    api.attemptPolicy.and.returnValue(pending);
    component.communityId=12;component.ngOnChanges();
    component.communityId=null;component.ngOnChanges();
    pending.next({
      stageId:501,versionId:80,draftRevision:4,
      policy:{maxAttempts:4,timeLimitSeconds:600,deadlineAt:null,
        hardDeadline:false,maxFocusLosses:null,blockCopy:false}
    });
    expect(component.attempt.maxAttempts).toBe(1);
    expect(component.attemptConfigured).toBeFalse();
  });

  it('surfaces revision conflict and does not claim save success',()=>{
    api.saveAttemptPolicy.and.returnValue(throwError(()=>({status:409})));
    component.saveAttempts();
    expect(component.error).toContain('rascunho foi alterado');
    expect(component.attemptConfigured).toBeFalse();
  });
});
