import { Component, Input, OnChanges, OnDestroy } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { RecruitmentVotingDecision } from '../../../core/services/recruitment-collective-voting.service';
import {
  RecruitmentDecisionDeskService, DecisionQueueItem, DecisionApplicationDetail,
  DecisionStageEvidence, DecisionStageSummary
} from '../../../core/services/recruitment-decision-desk.service';

/** Manager-only experience; the API enforces capability, membership and decision rules. */
@Component({
  selector:'app-recruitment-decision-desk',
  standalone:false,
  templateUrl:'./recruitment-decision-desk.component.html'
})
export class RecruitmentDecisionDeskComponent implements OnChanges,OnDestroy {
  @Input() communityId: number|null=null;
  @Input() processId: number|null=null;

  queue: DecisionQueueItem[]=[];
  selected: DecisionApplicationDetail|null=null;
  evidence: DecisionStageEvidence|null=null;
  loading=false;
  detailLoading=false;
  evidenceLoading=false;
  deciding=false;
  hasMore=false;
  error='';
  detailError='';
  evidenceError='';
  notice='';
  outcome: 'APPROVE'|'REJECT'='APPROVE';
  reason='';
  confirmed=false;

  private readonly destroyed$=new Subject<void>();
  private contextGeneration=0;
  private detailGeneration=0;
  private evidenceGeneration=0;
  private queueGeneration=0;

  constructor(private readonly service: RecruitmentDecisionDeskService) {}

  ngOnChanges(): void {
    this.contextGeneration++;
    this.queueGeneration++;
    this.detailGeneration++;
    this.evidenceGeneration++;
    this.queue=[];
    this.loading=false;
    this.hasMore=false;
    this.error='';
    this.notice='';
    this.clearDetail();
    if (this.communityId!==null && this.processId!==null) this.loadQueue();
  }

  ngOnDestroy(): void {
    this.contextGeneration++;
    this.queueGeneration++;
    this.detailGeneration++;
    this.evidenceGeneration++;
    this.clearDetail();
    this.queue=[];
    this.destroyed$.next();
    this.destroyed$.complete();
  }

  loadQueue(beforeId?: number): void {
    if (this.communityId===null || this.processId===null) return;
    const communityId=this.communityId;
    const processId=this.processId;
    const context=this.contextGeneration;
    const request=++this.queueGeneration;
    this.loading=true;
    this.error='';
    this.service.queue(communityId,processId,beforeId)
      .pipe(takeUntil(this.destroyed$)).subscribe({
        next: data => {
          if (context!==this.contextGeneration || request!==this.queueGeneration) return;
          this.queue=beforeId?[...this.queue,...data]:data;
          this.hasMore=data.length===100;
          this.loading=false;
        },
        error: err => {
          if (context!==this.contextGeneration || request!==this.queueGeneration) return;
          this.loading=false;
          this.error=this.failure(err);
        }
      });
  }

  loadMore(): void {
    if (this.loading || !this.hasMore || !this.queue.length) return;
    this.loadQueue(this.queue[this.queue.length-1].id);
  }

  open(item: DecisionQueueItem): void {
    if (this.communityId===null || this.processId===null || this.deciding) return;
    const communityId=this.communityId;
    const processId=this.processId;
    const context=this.contextGeneration;
    const request=++this.detailGeneration;
    this.evidenceGeneration++;
    this.clearDetail();
    this.detailLoading=true;
    this.service.detail(communityId,processId,item.id)
      .pipe(takeUntil(this.destroyed$)).subscribe({
        next: data => {
          if (context!==this.contextGeneration || request!==this.detailGeneration) return;
          this.selected=data;
          this.detailLoading=false;
        },
        error: err => {
          if (context!==this.contextGeneration || request!==this.detailGeneration) return;
          this.detailLoading=false;
          this.detailError=this.failure(err);
        }
      });
  }

  close(): void {
    this.detailGeneration++;
    this.evidenceGeneration++;
    this.clearDetail();
  }

  openEvidence(stage: DecisionStageSummary): void {
    if (this.communityId===null || this.processId===null ||
        !this.selected || this.deciding || !this.canInspect(stage)) return;
    const communityId=this.communityId;
    const processId=this.processId;
    const applicationId=this.selected.application.id;
    const context=this.contextGeneration;
    const detail=this.detailGeneration;
    const request=++this.evidenceGeneration;
    this.clearEvidence();
    this.evidenceLoading=true;
    this.service.evidence(communityId,processId,applicationId,stage.stageId)
      .pipe(takeUntil(this.destroyed$)).subscribe({
        next: result => {
          if (context!==this.contextGeneration ||
              detail!==this.detailGeneration || request!==this.evidenceGeneration) return;
          this.evidence=result;
          this.evidenceLoading=false;
        },
        error: err => {
          if (context!==this.contextGeneration ||
              detail!==this.detailGeneration || request!==this.evidenceGeneration) return;
          this.evidenceLoading=false;
          this.evidenceError=this.failure(err);
        }
      });
  }

  canInspect(stage: DecisionStageSummary): boolean {
    return ['IN_PROGRESS','AWAITING_REVIEW','COMPLETED','AWAITING_PUBLICATION']
      .includes(stage.internalStatus);
  }

  get canDecide(): boolean {
    const current=this.evidence?.stage;
    // The manager must be able to inspect every assessment before deciding.
    if (!current || !this.selected || this.deciding || this.evidenceLoading ||
        this.evidence?.truncated) return false;
    if (this.selected.application.internalStatus!=='IN_PROGRESS' ||
        current.internalStatus!=='AWAITING_REVIEW' ||
        current.stageType==='AUTO_EVALUATION' ||
        current.policy.decisionMode!=='MANUAL' ||
        current.assessmentCount<current.policy.minimumAssessments ||
        current.decisionOutcome!==null) return false;
    const stages=this.selected.stages;
    const index=stages.findIndex(s=>s.stageId===current.stageId);
    return index>=0 &&
      stages.slice(0,index).every(s=>s.internalStatus==='COMPLETED') &&
      stages.slice(index+1).every(s=>s.internalStatus==='PENDING');
  }

  get canSubmit(): boolean {
    return this.canDecide && this.confirmed &&
      (this.outcome==='APPROVE' || this.reason.trim().length>=10) &&
      this.reason.trim().length<=2000;
  }

  submit(): void {
    if (!this.canSubmit || !this.selected || !this.evidence ||
        this.communityId===null || this.processId===null) return;
    const communityId=this.communityId;
    const context=this.contextGeneration;
    const detail=this.detailGeneration;
    const stageId=this.evidence.stage.stageId;
    const applicationId=this.selected.application.id;
    this.deciding=true;
    this.detailError='';
    this.service.decide(communityId,applicationId,stageId,this.outcome,
      this.reason.trim() || null).pipe(takeUntil(this.destroyed$)).subscribe({
        next: result => {
          if (context!==this.contextGeneration || detail!==this.detailGeneration) return;
          this.deciding=false;
          this.detailGeneration++;
          this.evidenceGeneration++;
          this.clearDetail();
          this.notice=result.applicationStatus==='AWAITING_PUBLICATION'
            ? 'Decisão registrada. Resultado ainda privado: publicação manual pendente.'
            : 'Decisão registrada. A próxima etapa foi liberada quando aplicável.';
          this.loadQueue();
        },
        error: err => {
          if (context!==this.contextGeneration || detail!==this.detailGeneration) return;
          this.deciding=false;
          this.confirmed=false;
          this.detailError=err.status===409
            ? 'Etapa alterada ou pareceres insuficientes. Reabra a candidatura para atualizar.'
            : this.failure(err);
        }
      });
  }

  examRestored(): void {
    if(!this.selected || this.deciding)return;
    const application=this.selected.application;
    this.open(application);
    this.notice='Reabertura da prova registrada. Tentativa liberada; resultado da seleção permanece privado.';
  }

  voteFinalized(result: RecruitmentVotingDecision): void {
    // Refresh all private data after the stage transition; do not keep a stale tally.
    this.detailGeneration++;
    this.evidenceGeneration++;
    this.clearDetail();
    this.notice = result.receipt.applicationStatus === 'AWAITING_PUBLICATION'
      ? 'Votação consolidada. Resultado privado até publicação manual.'
      : 'Votação consolidada. Próxima etapa atualizada quando aplicável.';
    this.loadQueue();
  }

  get candidateAnswerEntries(): {question:string;value:string}[] {
    const data=this.selected?.candidateAnswers;
    if (!data) return [];
    return Object.entries(data).map(([question,value])=>({
      question,value:typeof value==='string'?value:JSON.stringify(value)
    }));
  }

  assessmentAnswers(answers: Record<string,unknown>|null): {question:string;value:string}[] {
    if (!answers) return [];
    return Object.entries(answers).map(([question,value])=>({
      question,value:typeof value==='string'?value:JSON.stringify(value)
    }));
  }

  private clearEvidence(): void {
    this.evidence=null;
    this.evidenceLoading=false;
    this.evidenceError='';
    this.outcome='APPROVE';
    this.reason='';
    this.confirmed=false;
  }

  private clearDetail(): void {
    this.selected=null;
    this.detailLoading=false;
    this.detailError='';
    this.deciding=false;
    this.clearEvidence();
  }

  private failure(err: {status?:number}): string {
    if (err.status===403 || err.status===404)
      return 'Conteúdo indisponível ou sua permissão de gestão foi revogada.';
    if (err.status===409) return 'Etapa alterada durante a operação. Recarregue.';
    if (err.status===400) return 'Revise os dados informados.';
    return 'Não foi possível consultar ou atualizar a mesa de decisões.';
  }
}
