import { Component, HostListener, Input, OnChanges, OnDestroy } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { RecruitmentExamNotice, RecruitmentExamNoticesService } from '../../../core/services/recruitment-exam-notices.service';
import { RecruitmentExamReviewService } from '../../../core/services/recruitment-exam-review.service';
import {
  CandidateExam, ExamNumericScore, ExamQuestion, ExamSession,
  ExamSubmissionReceipt, ExamIntegrityType, ExamIntegritySource,
  ReleasedExamScoreStage, RecruitmentExamService
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
  releasedScores: ReleasedExamScoreStage[] = [];
  releasedScoresLoading = false;
  releasedScoresError = '';
  incidentNotices: RecruitmentExamNotice[] = [];
  incidentLoading = false;
  incidentError = '';
  appealStatuses:Record<number,'NONE'|'PENDING'|'APPROVED'|'DENIED'|'ERROR'>={};
  selectedAppeal:RecruitmentExamNotice|null=null;
  appealReason='';
  appealBusy=false;
  appealError='';
  appealNotice='';
  answers: Record<string, unknown> = {};
  draftRevision = 0;
  draftSavedAt: string | null = null;
  draftLoading = false;
  draftReady = false;
  draftSaving = false;
  draftDirty = false;
  draftConflict = false;
  draftError = '';
  secondsLeft = 0;
  confirmed = false;
  blocked = false;
  loading = false;
  busy = false;
  error = '';
  notice = '';

  private readonly destroyed$ = new Subject<void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private draftTimer: ReturnType<typeof setTimeout> | null = null;
  private localDeadlineMs = 0;
  private away = false;
  private focusAwaySince = 0;
  private focusSource: 'TAB_HIDDEN' | 'WINDOW_BLUR' | null = null;
  private focusGraceTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly focusGraceMs = 5000;
  focusPhase:'IDLE'|'COUNTDOWN'|'SYNCING'|'WARNING'='IDLE';
  focusWarningError='';
  focusAckBusy=false;
  private sendingSignal = false;
  private pendingSignals: {id:string;type:ExamIntegrityType;source:ExamIntegritySource}[] = [];
  private identity = '';
  private generation = 0;

  constructor(private readonly api: RecruitmentExamService,
    private readonly incidents: RecruitmentExamNoticesService,
    private readonly appeals: RecruitmentExamReviewService) {}

  ngOnChanges(): void {
    const id = `${this.communityId}:${this.applicationId}`;
    if (id === this.identity) return;
    this.identity = id;
    ++this.generation;
    this.clearSensitive();
    this.exam = null;
    this.incidentNotices = [];
    this.incidentError = '';
    this.appealStatuses={};
    this.selectedAppeal=null;
    this.appealReason='';
    this.appealError='';
    this.appealNotice='';
    this.blocked = false;
    this.error = '';
    this.notice = '';
    this.loading = false;
    this.busy = false;
    if (this.communityId !== null && this.applicationId !== null) this.refresh();
  }

  refresh(): void {
    if (this.communityId === null || this.applicationId === null ||
        this.busy || this.session) return;
    const generation = ++this.generation;
    const communityId = this.communityId;
    const applicationId = this.applicationId;
    this.clearSensitive();
    this.exam = null;
    this.blocked = false;
    this.loading = true;
    this.error = '';
    this.loadIncidentNotices(generation,communityId,applicationId);
    this.loadReleasedScores(generation,communityId,applicationId);
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
          // Never disclose stage details on a feature/auth denial, but do not
          // silently hide the entire exam section when the API returns 404.
          this.error = error.status===404 || error.status===403
            ? 'Não foi possível confirmar a disponibilidade de provas para sua candidatura. ' +
              'Confira o acesso à comunidade e tente novamente.'
            : this.failure(error);
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
          this.resetFocusGrace();
          this.focusPhase=session.maxFocusLosses!==null &&
            session.focusLosses>(session.acknowledgedFocusLosses??session.focusLosses)
            ?'WARNING':'IDLE';
          this.focusWarningError='';
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
          this.loadDraft();
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
    this.answersChanged();
  }

  isMultipleSelected(question: ExamQuestion, optionId: string): boolean {
    const current = this.answers[question.id];
    return Array.isArray(current) && current.includes(optionId);
  }

  get pendingSignalsCount(): number {return this.pendingSignals.length;}

  get clock(): string {
    const minutes=Math.floor(this.secondsLeft/60);
    const seconds=this.secondsLeft%60;
    return `${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`;
  }

  get canSubmit(): boolean {
    return !!this.session && !this.busy && !this.blocked &&
      this.focusPhase==='IDLE' && !this.focusAckBusy &&
      this.draftReady && !this.draftLoading && !this.draftConflict &&
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
    // Final submission carries its own complete snapshot; an unfinished
    // autosave cannot replace the final answers even if its request arrives late.
    const snapshot=JSON.parse(JSON.stringify(this.answers)) as Record<string,unknown>;
    this.cancelDraftTimer();
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
          this.loadReleasedScores(generation,communityId,applicationId);
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
  onWindowBlur(): void { this.noteFocusLoss('WINDOW_BLUR'); if(this.draftDirty) this.saveDraft(); }

  @HostListener('document:visibilitychange')
  onVisibilityChange(): void {
    if(document.hidden) this.noteFocusLoss('TAB_HIDDEN');
    else if(document.hasFocus()) this.resumeFromFocusLoss();
  }

  @HostListener('window:focus')
  onWindowFocus(): void {
    if(!document.hidden) this.resumeFromFocusLoss();
  }

  noteFocusLoss(source:'TAB_HIDDEN'|'WINDOW_BLUR'): void {
    if(!this.session || this.blocked || this.busy ||
      this.secondsLeft<=0 || this.session.maxFocusLosses===null ||
      this.away || this.focusPhase!=='IDLE')return;
    this.away=true;
    this.focusPhase='COUNTDOWN';
    this.focusAwaySince=Date.now();
    this.focusSource=source;
    this.focusWarningError='';
    // Keep grace invisible; elapsed wall time is checked again when focus returns.
    this.focusGraceTimer=setTimeout(()=>{
      this.focusGraceTimer=null;
      // Timeout completion is authoritative even under fake timers in tests.
      // The return path also checks wall time when background timers are throttled.
      this.recordSustainedFocusLoss();
    },this.focusGraceMs);
  }

  private recordSustainedFocusLoss(): void {
    if(this.focusPhase!=='COUNTDOWN' || !this.away || !this.focusSource ||
      !this.session || this.blocked || this.secondsLeft<=0)return;
    const source=this.focusSource;
    this.focusSource=null;
    this.stopFocusCountdown();
    this.focusPhase='SYNCING'; // Do not allow another loss until server returns.
    this.queueSignal('FOCUS_LOST',source);
  }

  private resumeFromFocusLoss(): void {
    if(this.away && this.focusPhase==='COUNTDOWN') {
      // Browser throttles inactive timers; the return path uses elapsed wall time.
      if(Date.now()-this.focusAwaySince>=this.focusGraceMs)
        this.recordSustainedFocusLoss();
      else {
        this.resetFocusGrace();
        this.focusPhase='IDLE';
      }
    } else {
      this.resetFocusGrace(); // Do not clear SYNCING / WARNING states.
    }
    this.sendPendingSignals();
  }

  private stopFocusCountdown():void {
    if(this.focusGraceTimer!==null)clearTimeout(this.focusGraceTimer);
    this.focusGraceTimer=null;
  }

  private resetFocusGrace(): void {
    this.stopFocusCountdown();
    this.away=false;
    this.focusSource=null;
    this.focusAwaySince=0;
  }

  get focusWarningRemaining():number {
    return Math.max(0,(this.session?.maxFocusLosses??0)-
      (this.session?.focusLosses??0));
  }

  acknowledgeFocusWarning():void {
    if(this.focusPhase!=='WARNING' || !this.session || !this.exam ||
       this.communityId===null || this.applicationId===null ||
       this.focusAckBusy || this.secondsLeft<=0)return;
    const generation=this.generation,attemptId=this.session.attemptId;
    const communityId=this.communityId,applicationId=this.applicationId,
      stageId=this.exam.stageId;
    this.focusAckBusy=true;
    this.focusWarningError='';
    this.api.acknowledgeFocusWarning(communityId,applicationId,stageId,attemptId)
      .pipe(takeUntil(this.destroyed$)).subscribe({
        next:result=>{
          if(generation!==this.generation || this.session?.attemptId!==attemptId)return;
          this.focusAckBusy=false;
          this.session.acknowledgedFocusLosses=result.acknowledgedFocusLosses;
          this.session.focusLosses=result.attemptFocusLosses;
          this.focusPhase='IDLE';
          this.notice='Advertência confirmada. Evite novas saídas da avaliação.';
        },
        error:()=>{
          if(generation!==this.generation || this.session?.attemptId!==attemptId)return;
          this.focusAckBusy=false;
          this.focusWarningError='Não foi possível confirmar a advertência. Tente novamente.';
        }
      });
  }

  preventCopy(event:Event,source:'COPY'|'CUT'|'CONTEXT_MENU'): void {
    if(!this.session?.blockCopy || this.secondsLeft<=0 || this.blocked)return;
    event.preventDefault();
    event.stopPropagation();
    // Merely discourages copy from this page. Browser APIs cannot prevent
    // screenshots, photos, developer tools or external AI usage.
    this.queueSignal('COPY_PREVENTED',source);
  }

  /** Invoked only for candidate answer edits, never for server draft restoration. */
  answersChanged(): void {
    if(!this.session || !this.draftReady || this.draftLoading || this.draftConflict ||
      this.busy || this.secondsLeft<=0 || this.focusPhase!=='IDLE') return;
    this.confirmed=false;
    this.draftDirty=true;
    this.draftError='';
    this.scheduleDraft();
  }

  private scheduleDraft(): void {
    this.cancelDraftTimer();
    if(!this.session || !this.draftDirty || this.draftSaving ||
       this.draftLoading || this.draftConflict || this.busy) return;
    this.draftTimer=setTimeout(()=>this.saveDraft(),1200);
  }

  retryDraft(): void {
    if(this.draftConflict) return;
    if(this.draftLoading) return;
    if(this.draftError && !this.draftDirty) this.loadDraft();
    else if(this.draftDirty) this.saveDraft();
  }

  private loadDraft(): void {
    if(!this.session || !this.exam ||
       this.communityId===null || this.applicationId===null)return;
    const generation=this.generation;
    const attemptId=this.session.attemptId,stageId=this.exam.stageId;
    const communityId=this.communityId,applicationId=this.applicationId;
    this.draftLoading=true;
    this.draftReady=false;
    this.draftError='';
    this.draftConflict=false;
    this.api.draft(communityId,applicationId,stageId,attemptId)
      .pipe(takeUntil(this.destroyed$)).subscribe({
        next:result=>{
          if(generation!==this.generation || this.session?.attemptId!==attemptId)return;
          this.answers={...result.answers};
          this.draftRevision=result.revision;
          this.draftSavedAt=result.savedAt;
          this.draftDirty=false;
          this.draftLoading=false;
          this.draftReady=true;
        },
        error:()=>{
          if(generation!==this.generation || this.session?.attemptId!==attemptId)return;
          this.draftLoading=false;
          // Do not allow typing over an unknown existing server draft.
          this.draftError='Não foi possível recuperar o rascunho. Tente novamente antes de responder.';
        }
      });
  }

  private saveDraft(): void {
    if(!this.session || !this.exam || this.communityId===null ||
       this.applicationId===null || this.draftLoading || this.draftSaving ||
       !this.draftReady || this.draftConflict || !this.draftDirty || this.busy ||
       this.secondsLeft<=0)return;
    this.cancelDraftTimer();
    const generation=this.generation;
    const attemptId=this.session.attemptId,stageId=this.exam.stageId;
    const communityId=this.communityId,applicationId=this.applicationId;
    const revision=this.draftRevision;
    const snapshot=JSON.parse(JSON.stringify(this.answers)) as Record<string,unknown>;
    this.draftSaving=true;
    this.draftDirty=false;
    this.draftError='';
    this.api.saveDraft(communityId,applicationId,stageId,attemptId,revision,snapshot)
      .pipe(takeUntil(this.destroyed$)).subscribe({
        next:result=>{
          if(generation!==this.generation || this.session?.attemptId!==attemptId)return;
          this.draftSaving=false;
          this.draftRevision=result.revision;
          this.draftSavedAt=result.savedAt;
          if(this.draftDirty) this.scheduleDraft();
        },
        error:err=>{
          if(generation!==this.generation || this.session?.attemptId!==attemptId)return;
          this.draftSaving=false;
          this.draftDirty=true;
          if(err.status===409 || err.status===403 || err.status===404) {
            this.draftConflict=true;
            this.draftError='O rascunho mudou em outra aba ou a prova encerrou. '+
              'Copie suas respostas manualmente se necessário e recarregue a tentativa.';
          } else {
            this.draftError='Não foi possível salvar as respostas. Confira sua conexão e tente novamente.';
          }
        }
      });
  }

  private cancelDraftTimer(): void {
    if(this.draftTimer!==null) clearTimeout(this.draftTimer);
    this.draftTimer=null;
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
            this.loadIncidentNotices(this.generation,communityId,applicationId);
            this.error='Sua prova foi bloqueada após atingir o limite de saídas da tela. '+
              'A gestão poderá analisar o registro.';
            return;
          }
          if(response.maxFocusLosses!==null && event.type==='FOCUS_LOST') {
            this.focusPhase='WARNING';
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
            if(event.type==='FOCUS_LOST')this.focusWarningError=
              'A ocorrência ainda não foi confirmada pelo servidor. Reenvie o registro.';
          }
        }
      });
  }

  refreshIncidentNotices(): void {
    if(this.communityId===null || this.applicationId===null) return;
    this.loadIncidentNotices(this.generation,this.communityId,this.applicationId);
  }

  markIncidentRead(notice: RecruitmentExamNotice): void {
    if(notice.read || this.communityId===null || this.applicationId===null) return;
    const generation=this.generation,communityId=this.communityId,applicationId=this.applicationId;
    this.incidents.candidateRead(communityId,applicationId,notice.id)
      .pipe(takeUntil(this.destroyed$)).subscribe({
        next:()=>{
          if(generation!==this.generation)return;
          this.incidentNotices=this.incidentNotices.map(item=>
            item.id===notice.id?{...item,read:true}:item);
        },
        error:()=>{
          if(generation===this.generation)
            this.incidentError='Não foi possível registrar a leitura do aviso.';
        }
      });
  }

  private loadIncidentNotices(generation:number,communityId:number,applicationId:number):void {
    this.incidentLoading=true;
    this.incidentError='';
    this.incidents.candidate(communityId,applicationId)
      .pipe(takeUntil(this.destroyed$)).subscribe({
        next:items=>{
          if(generation!==this.generation)return;
          this.incidentNotices=items;
          this.incidentLoading=false;
          for(const item of items) {
            if(item.eventType!=='BLOCKED') continue;
            this.appeals.candidateAppealStatus(
              communityId,applicationId,item.stageId,item.attemptId)
              .pipe(takeUntil(this.destroyed$)).subscribe({
                next: status=>{
                  if(generation===this.generation)
                    this.appealStatuses[item.attemptId]=status.status;
                },
                error: err=>{
                  if(generation===this.generation)
                    this.appealStatuses[item.attemptId]=err.status===404?'NONE':'ERROR';
                }
              });
          }
        },
        error:err=>{
          if(generation!==this.generation)return;
          this.incidentLoading=false;
          if(err.status!==404) this.incidentError='Não foi possível consultar avisos da prova.';
        }
      });
  }

  canRequestAppeal(item:RecruitmentExamNotice):boolean {
    return item.eventType==='BLOCKED' && !!this.applicationId && !!this.communityId &&
      !this.appealBusy && this.appealStatuses[item.attemptId]==='NONE' &&
      !this.incidentNotices.some(n=>n.attemptId===item.attemptId &&
        n.eventType==='REINSTATED');
  }
  selectAppeal(item:RecruitmentExamNotice):void {
    if(!this.canRequestAppeal(item)) return;
    this.selectedAppeal=item;
    this.appealReason='';
    this.appealError='';
    this.appealNotice='';
  }
  get canSubmitAppeal():boolean {
    return this.selectedAppeal!==null && !this.appealBusy &&
      this.appealReason.trim().length>=20 && this.appealReason.trim().length<=2000;
  }
  sendAppeal():void {
    if(!this.canSubmitAppeal || this.communityId===null ||
      this.applicationId===null || !this.selectedAppeal)return;
    const communityId=this.communityId,applicationId=this.applicationId;
    const item=this.selectedAppeal,generation=this.generation;
    this.appealBusy=true;
    this.appealError='';
    this.appeals.candidateAppeal(communityId,applicationId,
      item.stageId,item.attemptId,this.appealReason.trim())
      .pipe(takeUntil(this.destroyed$)).subscribe({
        next:receipt=>{
          if(generation!==this.generation)return;
          this.appealBusy=false;
          this.appealStatuses[item.attemptId]=receipt.status;
          this.selectedAppeal=null;
          this.appealReason='';
          this.appealNotice='Pedido de revisão técnica registrado. A Staff poderá analisá-lo.';
        },
        error:err=>{
          if(generation!==this.generation)return;
          this.appealBusy=false;
          this.appealError=err.status===409
            ?'Esta tentativa já possui revisão ou o estado foi alterado. Atualize os avisos.'
            :'Não foi possível solicitar a revisão da tentativa.';
        }
      });
  }

  private loadReleasedScores(generation:number,communityId:number,applicationId:number):void {
    this.releasedScoresLoading=true;
    this.releasedScoresError='';
    this.api.releasedScores(communityId,applicationId)
      .pipe(takeUntil(this.destroyed$)).subscribe({
        next: rows=>{
          if(generation!==this.generation) return;
          this.releasedScores=rows;
          this.releasedScoresLoading=false;
        },
        error: ()=>{
          if(generation!==this.generation) return;
          this.releasedScoresLoading=false;
          this.releasedScoresError='Não foi possível consultar as notas divulgadas.';
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
    this.cancelDraftTimer();
    this.draftRevision=0;
    this.draftSavedAt=null;
    this.draftLoading=false;
    this.draftReady=false;
    this.draftSaving=false;
    this.draftDirty=false;
    this.draftConflict=false;
    this.draftError='';
    this.session=null;
    this.localDeadlineMs=0;
    this.resetFocusGrace();
    this.focusPhase='IDLE';
    this.focusWarningError='';
    this.focusAckBusy=false;
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
    this.selectedAppeal=null;
    this.appealReason='';
    this.appealBusy=false;
    this.appealStatuses={};
    this.appealError='';
    this.appealNotice='';
    this.releasedScores=[];
    this.releasedScoresLoading=false;
    this.releasedScoresError='';
  }
  ngOnDestroy(): void {
    ++this.generation;
    this.incidentNotices=[];
    this.incidentLoading=false;
    this.incidentError='';
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
