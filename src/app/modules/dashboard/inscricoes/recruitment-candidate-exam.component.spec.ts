import { of, Subject, throwError } from 'rxjs';
import {
  CandidateExam, ExamNumericScore, ExamSession, RecruitmentExamService
} from '../../../core/services/recruitment-exam.service';
import { RecruitmentCandidateExamComponent } from './recruitment-candidate-exam.component';

describe('RecruitmentCandidateExamComponent',()=>{
  let service:jasmine.SpyObj<RecruitmentExamService>;
  let component:RecruitmentCandidateExamComponent;
  const exam:CandidateExam={applicationId:100,stageId:501,publicName:'Prova objetiva'};
  const session:ExamSession={
    attemptId:800,applicationId:100,stageId:501,attemptNumber:1,
    status:'STARTED',expiresAt:new Date(Date.now()+120000).toISOString(),
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
       'saveAttemptPolicy','gradePolicy','saveGradePolicy']);
    service.currentExams.and.returnValue(of([exam]));
    service.ownScores.and.returnValue(throwError(()=>({status:404})));
    service.start.and.returnValue(of(session));
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
