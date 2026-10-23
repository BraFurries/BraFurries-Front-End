import { Component, HostListener, Input, OnChanges, OnDestroy } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import {
  CandidateExam, ExamNumericScore, ExamQuestion, ExamSession,
  ExamSubmissionReceipt, ExamIntegrityType, ExamIntegritySource, RecruitmentExamService
} from '../../../core/services/recruitment-exam.service';

/** Candidate-only exam runner; timing and eligibility are authoritative on the API. */
@Component({
  selector:'app-recruitment-candidate-exam',
  standalone:false,
  templateUrl:'./recruitment-candidate-exam.component.html'
})
export class RecruitmentCandidateExamComponent implements OnChanges, OnDestroy {
  @Input() communityId: number | null = null;
  @Input() applicationId: number | null = null;

  exam: CandidateExam | null = null;
  session: ExamSession | null = null;
  submitted: ExamSubmissionReceipt | null = null;
  scores: ExamNumericScore[] = [];
  answers: Record<string, unknown> = {};
  secondsLeft = 0;
  confirmed = false;
  blocked = false;
  loading = false;
  busy = false;
  error = '';
  notice = '';

  private readonly destroyed$ = new Subject<void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private localDeadlineMs = 0;
  private away = false;
  private sendingSignal = false;
  private pendingSignals: {id:string;type:ExamIntegrityType;source:ExamIntegritySource}[] = [];
  private identity = '';
  private generation = 0;

  constructor(private readonly api: RecruitmentExamService) {}

  ngOnChanges(): void {
    const id = `${this.communityId}:${this.applicationId}`;
    if (id === this.identity) return;
    this.identity = id;
    ++this.generation;
    this.clearSensitive();
    this.exam = null;
    this.blocked = false;
    this.error = '';
    this.notice = '';
    this.loading = false;
    this.busy = false;
    if (this.communityId !== null && this.applicationId !== null) this.refresh();
  }

  refresh(): void {
    if (this.communityId === null || this.applicationId === null || this.busy) return;
    const generation = ++this.generation;
    const communityId = this.communityId;
    const applicationId = this.applicationId;
    this.clearSensitive();
    this.exam = null;
    this.blocked = false;
    this.loading = true;
    this.error = '';
    this.api.currentExams(communityId,applicationId)
      .pipe(takeUntil(this.destroyed$)).subscribe({
        next: exams => {
          if (generation !== this.generation) return;
          this.exam = exams.length ? exams[0] : null;
          this.blocked = this.exam?.blocked === true;
          this.loading = false;
          if (this.exam) this.loadScores(generation,communityId,applicationId,this.exam.stageId);
        },
        error: error => {
          if (generation !== this.generation) return;
          this.loading = false;
          // No candidate-stage information is disclosed on feature/auth denial.
          if (error.status !== 404) this.error = this.failure(error);
        }
      });
  }

  start(): void {
    if (!this.exam || this.communityId === null || this.applicationId === null ||
        this.loading || this.busy || this.session || this.blocked) return;
    const generation = this.generation;
    const communityId = this.communityId;
    const applicationId = this.applicationId;
    const stageId = this.exam.stageId;
    this.busy = true;
    this.error = '';
    this.notice = '';
    this.api.start(communityId,applicationId,stageId)
      .pipe(takeUntil(this.destroyed$)).subscribe({
        next: session => {
          if (generation !== this.generation || stageId !== this.exam?.stageId) return;
          this.busy = false;
          this.session = session;
          this.away = false;
          this.pendingSignals = [];
          this.sendingSignal = false;
          // Server's own clock is the baseline; client's wall-clock skew does not
          // affect the countdown. API still rejects late submissions.
          this.localDeadlineMs = Date.now() + Math.max(0,
            Date.parse(session.expiresAt) - Date.parse(session.serverNow));
          this.answers = {};
          this.submitted = null;
          this.confirmed = false;
          this.startClock();
        },
        error: error => {
          if (generation !== this.generation) return;
          this.busy = false;
          this.error = this.failure(error);
        }
      });
  }

  toggleMultiple(question: ExamQuestion, optionId: string, checked: boolean): void {
    if (!this.session || this.secondsLeft<=0) return;
    const current = this.answers[question.id];
    const selected = Array.isArray(current) ? [...current] as string[] : [];
    this.answers[question.id] = checked
      ? [...new Set([...selected,optionId])]
      : selected.filter(id => id !== optionId);
    this.confirmed = false;
  }

  isMultipleSelected(question: ExamQuestion, optionId: string): boolean {
    const current = this.answers[question.id];
    return Array.isArray(current) && current.includes(optionId);
  }

  get clock(): string {
    const minutes=Math.floor(this.secondsLeft/60);
    const seconds=this.secondsLeft%60;
    return `${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`;
  }

  get canSubmit(): boolean {
    return !!this.session && !this.busy && !this.blocked &&
      !this.pendingSignals.length && this.secondsLeft > 0 &&
      this.confirmed && this.session.form.questions.every(q => {
        if (!q.required) return true;
        const answer = this.answers[q.id];
        if (answer === null || answer === undefined || answer === '') return false;
        if (Array.isArray(answer)) return answer.length>0;
        return true;
      });
  }

  submit(): void {
    if (!this.canSubmit || !this.session || !this.exam ||
        this.communityId === null || this.applicationId === null) return;
    const generation = this.generation;
    const communityId=this.communityId, applicationId=this.applicationId,
      stageId=this.exam.stageId, attemptId=this.session.attemptId;
    const snapshot={...this.answers};
    this.busy=true;
    this.error='';
    this.api.submit(communityId,applicationId,stageId,attemptId,snapshot)
      .pipe(takeUntil(this.destroyed$)).subscribe({
        next: receipt => {
          if (generation !== this.generation) return;
          this.busy=false;
          this.submitted=receipt;
          this.clearAttempt();
          this.notice = receipt.score
            ? 'Tentativa enviada. Esta seleção permite consultar a nota desta prova.'
            : 'Tentativa enviada. A nota será mantida privada até sua divulgação.';
          if (receipt.score) this.scores=[...this.scores.filter(s=>s.attemptId!==receipt.score!.attemptId),receipt.score];
        },
        error: error => {
          if (generation !== this.generation) return;
          this.busy=false;
          this.confirmed=false;
          this.error=this.failure(error);
        }
      });
  }

  /**
   * Advisory browser events can be suppressed by browser extensions or JS changes.
   * Blur and hidden from one away cycle count as exactly one local event.
   */
  @HostListener('window:blur')
  onWindowBlur(): void { this.noteFocusLoss('WINDOW_BLUR'); }

  @HostListener('document:visibilitychange')
  onVisibilityChange(): void {
    if(document.hidden) this.noteFocusLoss('TAB_HIDDEN');
    else { this.away=false; this.sendPendingSignals(); }
  }

  @HostListener('window:focus')
  onWindowFocus(): void {
    if(!document.hidden) this.away=false;
    this.sendPendingSignals();
  }

  noteFocusLoss(source:'TAB_HIDDEN'|'WINDOW_BLUR'): void {
    if(!this.session || this.blocked || this.busy ||
      this.secondsLeft<=0 || this.session.maxFocusLosses===null || this.away)return;
    this.away=true;
    this.queueSignal('FOCUS_LOST',source);
  }

  preventCopy(event:Event,source:'COPY'|'CUT'|'CONTEXT_MENU'): void {
    if(!this.session?.blockCopy || this.secondsLeft<=0 || this.blocked)return;
    event.preventDefault();
    event.stopPropagation();
    // Merely discourages copy from this page. Browser APIs cannot prevent
    // screenshots, photos, developer tools or external AI usage.
    this.queueSignal('COPY_PREVENTED',source);
  }

  private queueSignal(type:ExamIntegrityType,source:ExamIntegritySource): void {
    if(!this.session || this.blocked || !globalThis.crypto?.randomUUID)return;
    if(this.pendingSignals.length>=12) {
      this.error='Não foi possível sincronizar os eventos da prova. Confira sua conexão.';
      return;
    }
    this.pendingSignals.push({id:crypto.randomUUID(),type,source});
    this.sendPendingSignals();
  }

  retryIntegrityEvents(): void { this.sendPendingSignals(); }

  private sendPendingSignals(): void {
    if(this.sendingSignal || this.pendingSignals.length===0 ||
      !this.session || !this.exam ||
      this.communityId===null || this.applicationId===null || this.blocked)return;
    const generation=this.generation;
    const communityId=this.communityId, applicationId=this.applicationId,
      stageId=this.exam.stageId,attemptId=this.session.attemptId;
    const event=this.pendingSignals[0];
    this.sendingSignal=true;
    this.api.integrityEvent(communityId,applicationId,stageId,
      attemptId,event.id,event.type,event.source)
      .pipe(takeUntil(this.destroyed$)).subscribe({
        next:response=>{
          if(generation!==this.generation || this.session?.attemptId!==attemptId)return;
          this.sendingSignal=false;
          this.pendingSignals.shift();
          this.session.focusLosses=response.focusLosses;
          if(response.blocked || response.status==='BLOCKED') {
            this.blocked=true;
            this.clearAttempt();
            this.error='Sua prova foi bloqueada após atingir o limite de saídas da tela. '+
              'A gestão poderá analisar o registro.';
            return;
          }
          if(response.maxFocusLosses!==null && event.type==='FOCUS_LOST') {
            this.notice=`Saídas registradas: ${response.focusLosses}/${response.maxFocusLosses}.`;
          }
          this.sendPendingSignals();
        },
        error:err=>{
          if(generation!==this.generation || this.session?.attemptId!==attemptId)return;
          this.sendingSignal=false;
          if(err.status===409 || err.status===404) {
            this.blocked=true;
            this.clearAttempt();
            this.error='O estado da tentativa mudou ou ela foi encerrada. '+
              'Atualize para verificar se a prova continua disponível.';
          } else {
            this.error='Não foi possível registrar um evento da prova. '+
              'Confira sua conexão e tente reenviar o registro.';
          }
        }
      });
  }

  private loadScores(generation: number,communityId:number,applicationId:number,stageId:number): void {
    this.api.ownScores(communityId,applicationId,stageId)
      .pipe(takeUntil(this.destroyed$)).subscribe({
        next: scores => {
          if (generation===this.generation && this.exam?.stageId===stageId)
            this.scores=scores;
        },
        error: () => {
          // PRIVATE policy returns 404. Never infer an exam result from this.
        }
      });
  }

  private startClock(): void {
    this.clearTimer();
    const update=()=>{
      if (!this.session) return;
      const remaining = Math.max(0,Math.ceil((this.localDeadlineMs-Date.now())/1000));
      this.secondsLeft=Number.isFinite(remaining)?remaining:0;
      if(this.secondsLeft===0) {
        this.confirmed=false;
        this.clearTimer();
        this.error='O tempo desta tentativa terminou. O servidor decidirá se existe outra oportunidade.';
      }
    };
    update();
    if(this.secondsLeft>0) this.timer=setInterval(update,1000);
  }

  private clearTimer(): void {
    if(this.timer!==null) clearInterval(this.timer);
    this.timer=null;
  }
  private clearAttempt(): void {
    this.clearTimer();
    this.session=null;
    this.localDeadlineMs=0;
    this.away=false;
    this.pendingSignals=[];
    this.sendingSignal=false;
    this.answers={};
    this.confirmed=false;
    this.secondsLeft=0;
  }
  private clearSensitive(): void {
    this.clearAttempt();
    this.submitted=null;
    this.scores=[];
  }
  ngOnDestroy(): void {
    ++this.generation;
    this.clearSensitive();
    this.exam=null;
    this.destroyed$.next();
    this.destroyed$.complete();
  }
  private failure(error:{status?:number}):string {
    if(error.status===409) return 'A tentativa ou o prazo mudou. Confira antes de iniciar ou enviar novamente.';
    if(error.status===400) return 'Revise as respostas obrigatórias e o formato das alternativas.';
    if(error.status===403 || error.status===404) return 'Prova indisponível para esta candidatura.';
    return 'Não foi possível consultar ou enviar a prova.';
  }
}
