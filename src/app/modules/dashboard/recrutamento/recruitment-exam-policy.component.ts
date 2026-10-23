import { Component, EventEmitter, Input, OnChanges, OnDestroy, Output } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import {
  AttemptPolicy, GradePolicy, RecruitmentExamService
} from '../../../core/services/recruitment-exam.service';

/** Administrative draft-only policy editor; revisions are enforced by the API. */
@Component({
  selector:'app-recruitment-exam-policy',
  standalone:false,
  templateUrl:'./recruitment-exam-policy.component.html'
})
export class RecruitmentExamPolicyComponent implements OnChanges, OnDestroy {
  @Input() communityId: number | null = null;
  @Input() processId: number | null = null;
  @Input() stageId: number | null = null;
  @Input() stageType = '';
  @Input() expectedRevision = 0;
  @Input() editable = false;
  @Output() saved = new EventEmitter<number>();

  attempt: AttemptPolicy = this.defaultAttempt();
  grade: GradePolicy = this.defaultGrade();
  attemptConfigured = false;
  gradeConfigured = false;
  deadlineLocal = '';
  loading = false;
  busy = false;
  error = '';
  notice = '';
  private identity = '';
  private generation = 0;
  private readonly destroyed$ = new Subject<void>();

  constructor(private readonly api: RecruitmentExamService) {}

  ngOnChanges(): void {
    const id=`${this.communityId}:${this.processId}:${this.stageId}:${this.stageType}`;
    if(this.identity===id) return;
    this.identity=id;
    ++this.generation;
    this.attempt=this.defaultAttempt();
    this.grade=this.defaultGrade();
    this.attemptConfigured=false;
    this.gradeConfigured=false;
    this.deadlineLocal='';
    this.loading=false;
    this.busy=false;
    this.error='';
    this.notice='';
    if(this.stageType==='AUTO_EVALUATION' &&
      this.communityId!==null && this.processId!==null && this.stageId!==null) this.load();
  }

  load():void {
    if(this.communityId===null || this.processId===null || this.stageId===null || this.busy) return;
    const communityId=this.communityId,processId=this.processId,stageId=this.stageId;
    const generation=++this.generation;
    this.loading=true;
    this.error='';
    this.api.attemptPolicy(communityId,processId,stageId)
      .pipe(takeUntil(this.destroyed$)).subscribe({
        next: result=>{
          if(generation!==this.generation)return;
          this.attempt={...result.policy};
          this.deadlineLocal=result.policy.deadlineAt
            ?this.toLocal(result.policy.deadlineAt):'';
          this.attemptConfigured=true;
          this.loading=false;
        },
        error:e=>{
          if(generation!==this.generation)return;
          this.loading=false;
          if(e.status!==404)this.error=this.failure(e);
        }
      });
    this.api.gradePolicy(communityId,processId,stageId)
      .pipe(takeUntil(this.destroyed$)).subscribe({
        next: result=>{
          if(generation!==this.generation)return;
          this.grade={...result.policy};
          this.gradeConfigured=true;
        },
        error:e=>{
          if(generation!==this.generation)return;
          if(e.status!==404)this.error=this.failure(e);
        }
      });
  }

  get canSaveAttempt():boolean {
    return this.editable && !this.busy && !this.loading &&
      this.stageType==='AUTO_EVALUATION' &&
      Number.isInteger(this.attempt.maxAttempts) &&
      this.attempt.maxAttempts>=1 && this.attempt.maxAttempts<=5 &&
      Number.isInteger(this.attempt.timeLimitSeconds) &&
      this.attempt.timeLimitSeconds>=60 && this.attempt.timeLimitSeconds<=14400 &&
      (this.attempt.maxFocusLosses===null ||
        (Number.isInteger(this.attempt.maxFocusLosses) &&
          this.attempt.maxFocusLosses>=1 && this.attempt.maxFocusLosses<=10));
  }
  get canSaveGrade():boolean {
    return this.canSaveAttempt && this.attemptConfigured &&
      Number.isFinite(this.grade.passingPercentage) &&
      this.grade.passingPercentage>=1 && this.grade.passingPercentage<=100 &&
      Math.round(this.grade.passingPercentage*100)/100===this.grade.passingPercentage &&
      (this.grade.resultStrategy==='BEST'||this.grade.resultStrategy==='LAST') &&
      (this.grade.scoreVisibility==='PRIVATE'||this.grade.scoreVisibility==='AFTER_SUBMISSION');
  }

  saveAttempts():void {
    if(!this.canSaveAttempt || this.communityId===null ||
      this.processId===null || this.stageId===null) return;
    const generation=this.generation,communityId=this.communityId,
      processId=this.processId,stageId=this.stageId;
    const policy:AttemptPolicy={...this.attempt,deadlineAt:this.deadlineLocal
      ?new Date(this.deadlineLocal).toISOString():null};
    this.busy=true;
    this.error='';
    this.notice='';
    this.api.saveAttemptPolicy(communityId,processId,stageId,this.expectedRevision,policy)
      .pipe(takeUntil(this.destroyed$)).subscribe({
        next: receipt=>{
          if(generation!==this.generation)return;
          this.busy=false;
          this.attemptConfigured=true;
          this.attempt={...receipt.policy};
          this.expectedRevision=receipt.draftRevision;
          this.saved.emit(receipt.draftRevision);
          this.notice='Política de tentativas salva. Confira a correção antes de publicar.';
        },
        error:e=>{
          if(generation!==this.generation)return;
          this.busy=false;
          this.error=this.failure(e);
        }
      });
  }

  saveGrades():void {
    if(!this.canSaveGrade || this.communityId===null ||
      this.processId===null || this.stageId===null)return;
    const generation=this.generation,communityId=this.communityId,
      processId=this.processId,stageId=this.stageId;
    this.busy=true;
    this.error='';
    this.notice='';
    this.api.saveGradePolicy(communityId,processId,stageId,
      this.expectedRevision,{...this.grade})
      .pipe(takeUntil(this.destroyed$)).subscribe({
        next:receipt=>{
          if(generation!==this.generation)return;
          this.busy=false;
          this.grade={...receipt.policy};
          this.gradeConfigured=true;
          this.expectedRevision=receipt.revision;
          this.saved.emit(receipt.revision);
          this.notice='Correção e divulgação da nota salvas para esta versão de rascunho.';
        },
        error:e=>{
          if(generation!==this.generation)return;
          this.busy=false;
          this.error=this.failure(e);
        }
      });
  }

  ngOnDestroy():void {
    ++this.generation;
    this.destroyed$.next();
    this.destroyed$.complete();
  }

  private defaultAttempt():AttemptPolicy {
    return {maxAttempts:1,timeLimitSeconds:1800,deadlineAt:null,
      hardDeadline:true,maxFocusLosses:null,blockCopy:false};
  }
  private defaultGrade():GradePolicy {
    return {passingPercentage:70,resultStrategy:'BEST',scoreVisibility:'PRIVATE'};
  }
  private toLocal(value:string):string {
    const date=new Date(value);
    const pad=(v:number)=>String(v).padStart(2,'0');
    return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T`+
      `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
  private failure(e:{status?:number}):string {
    if(e.status===409)return 'O rascunho foi alterado. Recarregue a seleção antes de salvar.';
    if(e.status===403||e.status===404)return 'Política indisponível ou acesso de gestão revogado.';
    if(e.status===400)return 'Revise os limites, prazos, percentuais e opções configuradas.';
    return 'Não foi possível consultar ou salvar a política da prova.';
  }
}
