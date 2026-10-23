import { Component, Input, OnChanges, OnDestroy } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import {
  CandidateExam, ExamNumericScore, ExamQuestion, ExamSession,
  ExamSubmissionReceipt, RecruitmentExamService
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
  loading = false;
  busy = false;
  error = '';
  notice = '';

  private readonly destroyed$ = new Subject<void>();
  private timer: ReturnType<typeof setInterval> | null = null;
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
    this.loading = true;
    this.error = '';
    this.api.currentExams(communityId,applicationId)
      .pipe(takeUntil(this.destroyed$)).subscribe({
        next: exams => {
          if (generation !== this.generation) return;
          this.exam = exams.length ? exams[0] : null;
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
        this.loading || this.busy || this.session) return;
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

  get canSubmit(): boolean {
    return !!this.session && !this.busy && this.secondsLeft > 0 &&
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
      const remaining = Math.max(0,Math.ceil((Date.parse(this.session.expiresAt)-Date.now())/1000));
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
