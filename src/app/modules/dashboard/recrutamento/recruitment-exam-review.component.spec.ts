import { of, Subject, throwError } from 'rxjs';
import {
  ExamReviewPanel, RecruitmentExamReviewService
} from '../../../core/services/recruitment-exam-review.service';
import { RecruitmentExamReviewComponent } from './recruitment-exam-review.component';

describe('RecruitmentExamReviewComponent',()=>{
  let api:jasmine.SpyObj<RecruitmentExamReviewService>;
  let component:RecruitmentExamReviewComponent;
  const review:ExamReviewPanel={
    applicationId:100,stageId:501,incidents:[{
      incident:{attemptId:800,status:'BLOCKED',focusLosses:3,
        originalExpiresAt:'2026-10-23T12:00:00Z',
        reinstatedAt:null,reinstatedUntil:null,reviewedByUserId:null,reviewReason:null},
      recordedFocusSignals:3,truncated:false,canReinstate:true,
      signals:[{id:1,eventType:'FOCUS_LOST',source:'TAB_HIDDEN',
        occurredAt:'2026-10-23T11:59:00Z'}]
    }]
  };
  const reason='Janela de acessibilidade do sistema retirou o foco sem intenção de cola';
  beforeEach(()=>{
    api=jasmine.createSpyObj('RecruitmentExamReviewService',['panel','reinstate','denyAppeal']);
    api.panel.and.returnValue(of(review));
    api.denyAppeal.and.returnValue(of({attemptId:800,status:'DENIED'}));
    api.reinstate.and.returnValue(of({
      applicationId:100,stageId:501,attemptId:800,restored:true,
      previousFocusLosses:3,expiresAt:'2026-10-23T17:00:00Z'
    }));
    component=new RecruitmentExamReviewComponent(api);
    component.communityId=11;component.applicationId=100;
    component.stageId=501;component.applicationStatus='IN_PROGRESS';
    component.stageStatus='AWAITING_CANDIDATE';
    component.ngOnChanges();
  });
  afterEach(()=>component.ngOnDestroy());

  it('loads evidence only on explicit manager click',()=>{
    expect(api.panel).not.toHaveBeenCalled();
    component.toggle();
    expect(api.panel).toHaveBeenCalledOnceWith(11,100,501);
    expect(component.panel?.incidents[0].recordedFocusSignals).toBe(3);
  });
  it('requires an eligible block, reason and explicit confirmation',()=>{
    component.toggle();
    component.select(review.incidents[0]);
    component.reason=reason;
    expect(component.canReinstate).toBeFalse();
    component.confirmed=true;
    expect(component.canReinstate).toBeTrue();
    const restored=jasmine.createSpy('restored');
    component.restored.subscribe(restored);
    component.reinstate();
    expect(api.reinstate).toHaveBeenCalledOnceWith(11,100,501,800,reason);
    expect(restored).toHaveBeenCalledTimes(1);
    expect(component.selectedAttempt).toBeNull();
    expect(component.notice).toContain('reaberta até');
  });
  it('handles Staff review after automatic block and records denial',()=>{
    api.panel.and.returnValue(of({...review,incidents:[{
      ...review.incidents[0],
      appeal:{
        attemptId:800,applicationId:100,stageId:501,candidateUserId:99,
        reason:'Sistema operacional interrompeu a janela de prova',status:'PENDING',
        requestedAt:'2026-10-27T12:00:00Z',
        reviewedByUserId:null,reviewReason:null,reviewedAt:null
      }
    }]}));
    component.applicationStatus='AWAITING_PUBLICATION';
    component.stageStatus='BLOCKED';
    component.ngOnChanges();
    expect(component.available).toBeTrue();
    component.toggle();
    component.select(component.panel!.incidents[0]);
    component.reason=reason;
    component.confirmed=true;
    expect(component.canDenyAppeal).toBeTrue();
    component.denyAppeal();
    expect(api.denyAppeal).toHaveBeenCalledWith(11,100,501,800,reason);
    expect(component.notice).toContain('negado');
  });

  it('does not allow reactivation when stage is already completed',()=>{
    component.stageStatus='COMPLETED';
    component.ngOnChanges();
    expect(component.available).toBeFalse();
    component.toggle();
    expect(api.panel).not.toHaveBeenCalled();
  });
  it('ignores stale confidential evidence on Community switch',()=>{
    const pending=new Subject<ExamReviewPanel>();
    api.panel.and.returnValue(pending);
    component.toggle();
    component.communityId=12;
    component.ngOnChanges();
    pending.next(review);
    expect(component.panel).toBeNull();
    expect(component.selectedAttempt).toBeNull();
    expect(component.open).toBeFalse();
  });
  it('keeps review open but requires renewed confirmation on conflict',()=>{
    component.toggle();
    component.select(review.incidents[0]);
    component.reason=reason;
    component.confirmed=true;
    api.reinstate.and.returnValue(throwError(()=>({status:409})));
    component.reinstate();
    expect(component.error).toContain('estado alterado');
    expect(component.confirmed).toBeFalse();
    expect(component.panel).toEqual(review);
  });
  it('disables restoration of already reviewed attempts',()=>{
    api.panel.and.returnValue(of({...review,incidents:[{
      ...review.incidents[0],canReinstate:false
    }]}));
    component.toggle();
    component.select(component.panel!.incidents[0]);
    expect(component.selectedAttempt).toBeNull();
    expect(component.canReinstate).toBeFalse();
  });
});
