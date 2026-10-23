import { Component, EventEmitter, Input, OnChanges, OnDestroy, Output } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import {
  ExamIncidentEvidence, ExamReviewPanel,
  RecruitmentExamReviewService
} from '../../../core/services/recruitment-exam-review.service';

@Component({
  selector:'app-recruitment-exam-review',
  standalone:false,
  templateUrl:'./recruitment-exam-review.component.html'
})
export class RecruitmentExamReviewComponent implements OnChanges,OnDestroy {
  @Input() communityId:number|null=null;
  @Input() applicationId:number|null=null;
  @Input() stageId:number|null=null;
  @Input() stageStatus='';
  @Input() applicationStatus='';
  @Output() restored=new EventEmitter<void>();

  panel:ExamReviewPanel|null=null;
  open=false;
  loading=false;
  busy=false;
  error='';
  notice='';
  selectedAttempt:number|null=null;
  reason='';
  confirmed=false;

  private identity='';
  private generation=0;
  private readonly destroy$=new Subject<void>();

  constructor(private readonly api:RecruitmentExamReviewService) {}

  ngOnChanges():void {
    const key=`${this.communityId}:${this.applicationId}:${this.stageId}:`+
      `${this.stageStatus}:${this.applicationStatus}`;
    if(key===this.identity)return;
    this.identity=key;
    ++this.generation;
    this.clear();
  }

  get available():boolean {
    return this.communityId!==null && this.applicationId!==null &&
      this.stageId!==null && this.applicationStatus==='IN_PROGRESS' &&
      this.stageStatus==='AWAITING_CANDIDATE';
  }

  toggle():void {
    if(!this.available || this.busy)return;
    this.open=!this.open;
    if(this.open) this.load();
    else { ++this.generation; this.clear(); }
  }

  load():void {
    if(!this.available || this.busy ||
      this.communityId===null || this.applicationId===null || this.stageId===null)return;
    const generation=++this.generation;
    this.loading=true;
    this.error='';
    this.notice='';
    this.api.panel(this.communityId,this.applicationId,this.stageId)
      .pipe(takeUntil(this.destroy$)).subscribe({
        next:result=>{
          if(generation!==this.generation)return;
          this.loading=false;
          this.panel=result;
          this.selectedAttempt=null;
          this.reason='';
          this.confirmed=false;
        },
        error:err=>{
          if(generation!==this.generation)return;
          this.loading=false;
          this.error=this.failure(err);
        }
      });
  }

  select(incident:ExamIncidentEvidence):void {
    if(this.busy || !incident.canReinstate)return;
    this.selectedAttempt=incident.incident.attemptId;
    this.reason='';
    this.confirmed=false;
    this.error='';
  }
  get canReinstate():boolean {
    return this.available && !this.loading && !this.busy &&
      this.selectedAttempt!==null && this.confirmed &&
      this.reason.trim().length>=20 && this.reason.trim().length<=2000 &&
      !!this.panel?.incidents.some(i=>i.incident.attemptId===this.selectedAttempt &&
        i.canReinstate);
  }

  reinstate():void {
    if(!this.canReinstate || this.communityId===null ||
      this.applicationId===null || this.stageId===null || this.selectedAttempt===null)return;
    const generation=this.generation;
    const communityId=this.communityId,applicationId=this.applicationId,
      stageId=this.stageId,attemptId=this.selectedAttempt;
    this.busy=true;
    this.error='';
    this.api.reinstate(communityId,applicationId,stageId,attemptId,this.reason.trim())
      .pipe(takeUntil(this.destroy$)).subscribe({
        next:receipt=>{
          if(generation!==this.generation)return;
          this.busy=false;
          this.notice=`Tentativa #${receipt.attemptId} reaberta até `+
            new Date(receipt.expiresAt).toLocaleString('pt-BR')+
            '. A decisão final do processo continua privada.';
          this.selectedAttempt=null;
          this.reason='';
          this.confirmed=false;
          this.load();
          this.restored.emit();
        },
        error:err=>{
          if(generation!==this.generation)return;
          this.busy=false;
          this.confirmed=false;
          this.error=this.failure(err);
        }
      });
  }

  ngOnDestroy():void {
    ++this.generation;
    this.clear();
    this.destroy$.next();
    this.destroy$.complete();
  }

  private clear():void {
    this.open=false;
    this.panel=null;
    this.loading=false;
    this.busy=false;
    this.error='';
    this.notice='';
    this.selectedAttempt=null;
    this.reason='';
    this.confirmed=false;
  }
  private failure(err:{status?:number}):string {
    if(err.status===409)return 'Bloqueio já revisto, etapa encerrada ou estado alterado. Recarregue a análise.';
    if(err.status===403 || err.status===404)return 'Incidente indisponível ou acesso revogado.';
    if(err.status===400)return 'Confira a justificativa e a tentativa selecionada.';
    return 'Não foi possível consultar ou reabrir a prova.';
  }
}
