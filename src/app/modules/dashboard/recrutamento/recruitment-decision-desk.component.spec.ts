import { of, Subject, throwError } from 'rxjs';
import {
  RecruitmentDecisionDeskService, DecisionQueueItem, DecisionApplicationDetail,
  DecisionStageEvidence, DecisionReceipt
} from '../../../core/services/recruitment-decision-desk.service';
import { RecruitmentDecisionDeskComponent } from './recruitment-decision-desk.component';

describe('RecruitmentDecisionDeskComponent', () => {
  let service:jasmine.SpyObj<RecruitmentDecisionDeskService>;
  let component:RecruitmentDecisionDeskComponent;

  const applicant:DecisionQueueItem={
    id:100,processId:70,processVersionId:80,candidateUserId:99,
    processTitle:'Colaboradores',internalStatus:'IN_PROGRESS',
    submittedAt:'2026-10-22T11:00:00Z'
  };
  const detail:DecisionApplicationDetail={
    application:applicant,
    candidateAnswers:{why:'Quero ajudar'},
    stages:[{
      stageId:501,position:1,publicName:'Inscrição',stageType:'APPLICATION',
      internalStatus:'AWAITING_REVIEW',assessmentCount:1,
      policy:{reviewMode:'INDIVIDUAL',decisionMode:'MANUAL',minimumAssessments:1},
      decisionOutcome:null,decisionReason:null,decidedByUserId:null,decidedAt:null
    },{
      stageId:502,position:2,publicName:'Entrevista',stageType:'INTERVIEW',
      internalStatus:'PENDING',assessmentCount:0,
      policy:{reviewMode:'INDIVIDUAL',decisionMode:'MANUAL',minimumAssessments:1},
      decisionOutcome:null,decisionReason:null,decidedByUserId:null,decidedAt:null
    }]
  };
  const evidence:DecisionStageEvidence={
    stage:detail.stages[0],truncated:false,
    assessments:[{
      id:900,evaluatorUserId:77,score:82,opinion:'Bom parecer',
      staffAnswers:{communication:'clara'},submittedAt:'2026-10-22T11:30:00Z'
    }]
  };
  const receipt:DecisionReceipt={
    decision:{id:1000,applicationId:100,stageId:501,decidedByUserId:76,
      outcome:'APPROVE',reason:null,decidedAt:'2026-10-22T12:00:00Z'},
    applicationStatus:'IN_PROGRESS',nextStageId:502,nextStageStatus:'AWAITING_REVIEW'
  };

  beforeEach(()=>{
    service=jasmine.createSpyObj('RecruitmentDecisionDeskService',
      ['queue','detail','evidence','decide']);
    service.queue.and.returnValue(of([applicant]));
    service.detail.and.returnValue(of(detail));
    service.evidence.and.returnValue(of(evidence));
    service.decide.and.returnValue(of(receipt));
    component=new RecruitmentDecisionDeskComponent(service);
    component.communityId=11;
    component.processId=70;
    component.ngOnChanges();
  });
  afterEach(()=>component.ngOnDestroy());

  it('loads a scoped manager queue and detail, without prematurely fetching staff evidence',()=>{
    expect(service.queue).toHaveBeenCalledOnceWith(11,70,undefined);
    component.open(applicant);
    expect(service.detail).toHaveBeenCalledOnceWith(11,70,100);
    expect(component.candidateAnswerEntries[0].value).toBe('Quero ajudar');
    expect(service.evidence).not.toHaveBeenCalled();
  });

  it('opens only available stages and displays confidential assessments explicitly',()=>{
    component.open(applicant);
    component.openEvidence(detail.stages[1]);
    expect(service.evidence).not.toHaveBeenCalled();
    component.openEvidence(detail.stages[0]);
    expect(service.evidence).toHaveBeenCalledOnceWith(11,70,100,501);
    expect(component.assessmentAnswers(component.evidence!.assessments[0].staffAnswers)[0].value)
      .toBe('clara');
    expect(component.canDecide).toBeTrue();
  });

  it('requires deliberate confirmation and rejection justification',()=>{
    component.open(applicant);
    component.openEvidence(detail.stages[0]);
    component.outcome='REJECT';
    component.confirmed=true;
    component.reason='curta';
    expect(component.canSubmit).toBeFalse();
    component.reason='Critérios não atendidos';
    expect(component.canSubmit).toBeTrue();
    component.submit();
    expect(service.decide).toHaveBeenCalledOnceWith(
      11,100,501,'REJECT','Critérios não atendidos');
    expect(component.selected).toBeNull();
    expect(component.evidence).toBeNull();
  });

  it('keeps final status private instead of implying candidate publication',()=>{
    service.decide.and.returnValue(of({...receipt,applicationStatus:'AWAITING_PUBLICATION'}));
    component.open(applicant);
    component.openEvidence(detail.stages[0]);
    component.confirmed=true;
    component.submit();
    expect(component.notice).toContain('publicação manual pendente');
    expect(component.evidence).toBeNull();
    expect(component.queue.length).toBe(1);
  });

  it('never offers a decision below the frozen minimum or with automated voting',()=>{
    component.open(applicant);
    component.openEvidence(detail.stages[0]);
    component.evidence!.stage.policy={
      reviewMode:'COLLECTIVE',decisionMode:'MANUAL',minimumAssessments:3
    };
    expect(component.canDecide).toBeFalse();
    component.evidence!.stage.policy={
      reviewMode:'COLLECTIVE',decisionMode:'AUTOMATIC_VOTE',minimumAssessments:1
    };
    expect(component.canDecide).toBeFalse();
    component.submit();
    expect(service.decide).not.toHaveBeenCalled();
  });

  it('wipes candidate and reviewer private data after closing details',()=>{
    component.open(applicant);
    component.openEvidence(detail.stages[0]);
    component.reason='Informação sensível';
    component.close();
    expect(component.selected).toBeNull();
    expect(component.evidence).toBeNull();
    expect(component.reason).toBe('');
    expect(component.candidateAnswerEntries).toEqual([]);
  });

  it('drops stale private responses when the Community changes',()=>{
    const pending=new Subject<DecisionApplicationDetail>();
    service.detail.and.returnValue(pending);
    component.open(applicant);
    component.communityId=12;
    component.processId=71;
    component.ngOnChanges();
    pending.next(detail);
    expect(component.selected).toBeNull();
    expect(component.evidence).toBeNull();
    expect(service.queue).toHaveBeenCalledWith(12,71,undefined);
  });

  it('does not claim success after a concurrent stage conflict',()=>{
    service.decide.and.returnValue(throwError(()=>({status:409})));
    component.open(applicant);
    component.openEvidence(detail.stages[0]);
    component.confirmed=true;
    component.submit();
    expect(component.detailError).toContain('Reabra');
    expect(component.confirmed).toBeFalse();
    expect(component.selected).not.toBeNull();
  });

  it('clears the manager-only content when component access is destroyed',()=>{
    component.open(applicant);
    component.openEvidence(detail.stages[0]);
    component.ngOnDestroy();
    expect(component.selected).toBeNull();
    expect(component.evidence).toBeNull();
    expect(component.queue).toEqual([]);
  });
});
