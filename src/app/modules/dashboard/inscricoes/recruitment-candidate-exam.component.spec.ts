import { of, Subject, throwError } from 'rxjs';
import {
  CandidateExam, ExamNumericScore, ExamSession, RecruitmentExamService
} from '../../../core/services/recruitment-exam.service';
import { RecruitmentCandidateExamComponent } from './recruitment-candidate-exam.component';

describe('RecruitmentCandidateExamComponent',()=>{
  let service:jasmine.SpyObj<RecruitmentExamService>;
  let component:RecruitmentCandidateExamComponent;
  const exam:CandidateExam={applicationId:100,stageId:501,publicName:'Prova objetiva',
    blocked:false};
  const session:ExamSession={
    attemptId:800,applicationId:100,stageId:501,attemptNumber:1,
    status:'STARTED',expiresAt:new Date(Date.now()+120000).toISOString(),
    serverNow:new Date().toISOString(),
    maxFocusLosses:null,blockCopy:false,focusLosses:0,
    form:{questions:[
      {id:'first',label:'Qual opção?',type:'SINGLE_CHOICE',required:true,
       options:[{id:'a',label:'A'},{id:'b',label:'B'}],minValue:null,maxValue:null}
    ]}
  };
  const score:ExamNumericScore={
    attemptId:800,earnedPoints:8,possiblePoints:10,percentage:80
  };

  beforeEach(()=>{
    service=jasmine.createSpyObj('RecruitmentExamService',
      ['currentExams','start','submit','ownScores','attemptPolicy',
       'saveAttemptPolicy','gradePolicy','saveGradePolicy','integrityEvent','draft','saveDraft']);
    service.currentExams.and.returnValue(of([exam]));
    service.ownScores.and.returnValue(throwError(()=>({status:404})));
    service.start.and.returnValue(of(session));
    service.draft.and.returnValue(of({
      attemptId:800,revision:0,savedAt:null,answers:{}
    }));
    service.saveDraft.and.returnValue(of({
      attemptId:800,revision:1,savedAt:new Date().toISOString(),answers:{first:'b'}
    }));
    service.integrityEvent.and.returnValue(of({
      eventId:'00000000-0000-4000-8000-000000000001',
      status:'STARTED',focusLosses:1,maxFocusLosses:3,blocked:false
    }));
    service.submit.and.returnValue(of({
      attemptId:800,applicationId:100,stageId:501,status:'SUBMITTED',
      submittedAt:new Date().toISOString(),score
    }));
    component=new RecruitmentCandidateExamComponent(service);
    component.communityId=11;component.applicationId=100;
    component.ngOnChanges();
  });
  afterEach(()=>component.ngOnDestroy());

  it('discovers only current objective exams from the scoped application',()=>{
    expect(service.currentExams).toHaveBeenCalledOnceWith(11,100);
    expect(component.exam).toEqual(exam);
    expect(component.session).toBeNull();
  });

  it('computes countdown from server time even when local time is skewed',()=>{
    service.start.and.returnValue(of({
      ...session,
      serverNow:'2026-10-23T00:00:00Z',
      expiresAt:'2026-10-23T00:01:30Z'
    }));
    component.start();
    expect(component.secondsLeft).toBeGreaterThanOrEqual(89);
    expect(component.secondsLeft).toBeLessThanOrEqual(91);
    expect(component.clock).toMatch(/^01:3[01]$/);
  });

  it('recovers a private draft when resuming an attempt',()=>{
    service.draft.and.returnValue(of({
      attemptId:800,revision:4,savedAt:new Date().toISOString(),answers:{first:'b'}
    }));
    component.start();
    expect(service.draft).toHaveBeenCalledOnceWith(11,100,501,800);
    expect(component.answers['first']).toBe('b');
    expect(component.draftRevision).toBe(4);
    expect(component.draftReady).toBeTrue();
  });

  it('sends one CAS draft and preserves the server revision',()=>{
    component.start();
    component.answers['first']='b';
    component.answersChanged();
    expect(component.draftDirty).toBeTrue();
    component.retryDraft();
    expect(service.saveDraft).toHaveBeenCalledOnceWith(11,100,501,800,0,{first:'b'});
    expect(component.draftRevision).toBe(1);
    expect(component.draftDirty).toBeFalse();
  });

  it('never overwrites a newer draft after revision conflict',()=>{
    component.start();
    component.answers['first']='b';
    component.answersChanged();
    service.saveDraft.and.returnValue(throwError(()=>({status:409})));
    component.retryDraft();
    expect(component.draftConflict).toBeTrue();
    expect(component.canSubmit).toBeFalse();
    expect(component.answers['first']).toBe('b');
    component.retryDraft();
    expect(service.saveDraft).toHaveBeenCalledTimes(1);
  });

  it('does not allow edits before a draft has been retrieved',()=>{
    const pending=new Subject<{
      attemptId:number;revision:number;savedAt:string|null;answers:Record<string,unknown>
    }>();
    service.draft.and.returnValue(pending);
    component.start();
    expect(component.draftReady).toBeFalse();
    component.answersChanged();
    expect(component.draftDirty).toBeFalse();
    pending.next({attemptId:800,revision:1,savedAt:null,answers:{first:'a'}});
    expect(component.answers['first']).toBe('a');
    expect(component.draftReady).toBeTrue();
  });

  it('does not start exam without candidate click',()=>{
    expect(service.start).not.toHaveBeenCalled();
    component.start();
    expect(service.start).toHaveBeenCalledOnceWith(11,100,501);
    expect(component.session?.attemptId).toBe(800);
    expect(component.secondsLeft).toBeGreaterThan(0);
  });

  it('requires complete answers and confirmation for one-time submission',()=>{
    component.start();
    component.confirmed=true;
    expect(component.canSubmit).toBeFalse();
    component.answers['first']='b';
    expect(component.canSubmit).toBeTrue();
    component.submit();
    expect(service.submit).toHaveBeenCalledOnceWith(11,100,501,800,{first:'b'});
    expect(component.session).toBeNull();
    expect(component.answers).toEqual({});
    expect(component.scores).toEqual([score]);
    expect(component.notice).toContain('nota desta prova');
  });

  it('never invents a numeric result in private mode',()=>{
    service.submit.and.returnValue(of({
      attemptId:800,applicationId:100,stageId:501,status:'SUBMITTED',
      submittedAt:new Date().toISOString(),score:null
    }));
    component.start();
    component.answers['first']='a';component.confirmed=true;
    component.submit();
    expect(component.scores).toEqual([]);
    expect(component.notice).toContain('privada');
  });

  it('ignores late examination response after Community switch',()=>{
    const pending=new Subject<ExamSession>();
    service.start.and.returnValue(pending);
    component.start();
    component.communityId=12;
    component.ngOnChanges();
    pending.next(session);
    expect(component.session).toBeNull();
    expect(component.answers).toEqual({});
    expect(component.secondsLeft).toBe(0);
  });

  it('blocks client-side submission when the server deadline is past',()=>{
    service.start.and.returnValue(of({...session,expiresAt:
      new Date(Date.now()-10000).toISOString()}));
    component.start();
    component.answers['first']='a';component.confirmed=true;
    expect(component.secondsLeft).toBe(0);
    expect(component.canSubmit).toBeFalse();
    component.submit();
    expect(service.submit).not.toHaveBeenCalled();
  });

  it('registers only one event per blur plus hide cycle',()=>{
    service.start.and.returnValue(of({...session,maxFocusLosses:3}));
    component.start();
    component.noteFocusLoss('WINDOW_BLUR');
    component.noteFocusLoss('TAB_HIDDEN');
    expect(service.integrityEvent).toHaveBeenCalledTimes(1);
    expect(service.integrityEvent.calls.mostRecent().args.slice(0,4))
      .toEqual([11,100,501,800]);
    expect(component.session?.focusLosses).toBe(1);
    expect(component.notice).toContain('1/3');
  });

  it('blocks the exam and clears answers after threshold response',()=>{
    service.start.and.returnValue(of({...session,maxFocusLosses:3,focusLosses:2}));
    service.integrityEvent.and.returnValue(of({
      eventId:'00000000-0000-4000-8000-000000000001',
      status:'BLOCKED',focusLosses:3,maxFocusLosses:3,blocked:true
    }));
    component.start();
    component.answers['first']='a';
    component.noteFocusLoss('TAB_HIDDEN');
    expect(component.blocked).toBeTrue();
    expect(component.session).toBeNull();
    expect(component.answers).toEqual({});
    expect(component.canSubmit).toBeFalse();
    expect(component.error).toContain('bloqueada');
  });

  it('stops copy only when policy is enabled',()=>{
    component.start();
    const unrestricted=new Event('copy',{cancelable:true});
    component.preventCopy(unrestricted,'COPY');
    expect(unrestricted.defaultPrevented).toBeFalse();
    expect(service.integrityEvent).not.toHaveBeenCalled();
   });

  it('can log prevented copies without incrementing focus counter',()=>{
    service.start.and.returnValue(of({...session,blockCopy:true,maxFocusLosses:3}));
    service.integrityEvent.and.returnValue(of({
      eventId:'00000000-0000-4000-8000-000000000001',
      status:'STARTED',focusLosses:0,maxFocusLosses:3,blocked:false
    }));
    component.start();
    const copy=new Event('copy',{cancelable:true});
    component.preventCopy(copy,'COPY');
    expect(copy.defaultPrevented).toBeTrue();
    expect(service.integrityEvent).toHaveBeenCalledTimes(1);
    expect(service.integrityEvent.calls.mostRecent().args.slice(-2))
      .toEqual(['COPY_PREVENTED','COPY']);
    expect(component.session?.focusLosses).toBe(0);
  });

  it('does not allow a blocked exam to start after page refresh',()=>{
    service.currentExams.and.returnValue(of([{...exam,blocked:true}]));
    component.refresh();
    expect(component.blocked).toBeTrue();
    component.start();
    expect(service.start).not.toHaveBeenCalled();
  });

  it('preserves answers when submission returns a conflict but never pretends success',()=>{
    service.submit.and.returnValue(throwError(()=>({status:409})));
    component.start();
    component.answers['first']='a';component.confirmed=true;
    component.submit();
    expect(component.answers['first']).toBe('a');
    expect(component.submitted).toBeNull();
    expect(component.confirmed).toBeFalse();
    expect(component.error).toContain('prazo mudou');
  });
});
