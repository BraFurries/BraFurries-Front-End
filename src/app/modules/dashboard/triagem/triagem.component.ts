import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { CommunityContextService } from '../../../core/services/community-context.service';
import {
  RecruitmentTrackingService, ReviewableRecruitmentProcess,
  ReviewApplication, ReviewQueueItem, ReviewStage, StaffAssessmentForm, OwnStaffAssessment
} from '../../../core/services/recruitment-tracking.service';

@Component({
  selector: 'app-triagem',
  standalone: false,
  templateUrl: './triagem.component.html'
})
export class TriagemComponent implements OnInit, OnDestroy {
  communityId: number | null = null;
  processes: ReviewableRecruitmentProcess[] = [];
  processId: number | null = null;
  queue: ReviewQueueItem[] = [];
  selected: ReviewApplication | null = null;
  loading = false;
  busy = false;
  hasMore = false;
  error = '';
  assessmentForm: StaffAssessmentForm | null = null;
  assessmentStage: ReviewStage | null = null;
  savedAssessment: OwnStaffAssessment | null = null;
  score: number | null = null;
  opinion = '';
  staffAnswers: Record<string, unknown> = {};
  assessmentBusy = false;
  assessmentError = '';
  assessmentMessage = '';

  private readonly destroyed$ = new Subject<void>();
  private generation = 0;

  constructor(
    private readonly context: CommunityContextService,
    private readonly tracking: RecruitmentTrackingService
  ) {}

  ngOnInit(): void {
    this.context.state$.pipe(takeUntil(this.destroyed$)).subscribe(state => {
      const id = state.status === 'ready' && this.context.canAccessFeature('triagem', state)
        ? state.activeCommunity?.communityId ?? null : null;
      if (id === this.communityId) return;
      this.communityId = id;
      this.generation++;
      this.processes = [];
      this.processId = null;
      this.queue = [];
      this.selected = null;
      this.loading = false;
      this.busy = false;
      this.hasMore = false;
      this.error = '';
      this.resetAssessment();
      if (id !== null) this.loadProcesses();
    });
  }

  ngOnDestroy(): void {
    this.generation++;
    this.destroyed$.next();
    this.destroyed$.complete();
  }

  loadProcesses(): void {
    if (this.communityId === null) return;
    const id = this.communityId;
    const current = ++this.generation;
    this.loading = true;
    this.error = '';
    this.tracking.reviewProcesses(id).pipe(takeUntil(this.destroyed$)).subscribe({
      next: list => {
        if (current !== this.generation) return;
        this.processes = list;
        this.loading = false;
        if (list.length) this.selectProcess(list[0].id);
      },
      error: error => {
        if (current !== this.generation) return;
        this.loading = false;
        this.error = this.message(error);
      }
    });
  }

  selectProcess(processId: number): void {
    if (this.communityId === null || !this.processes.some(item => item.id === processId)) return;
    this.processId = processId;
    this.queue = [];
    this.selected = null;
    this.resetAssessment();
    this.hasMore = false;
    this.loadQueue();
  }

  loadQueue(beforeId?: number): void {
    if (this.communityId === null || this.processId === null) return;
    const id = this.communityId;
    const processId = this.processId;
    const current = ++this.generation;
    this.loading = true;
    this.error = '';
    this.tracking.queue(id, processId, beforeId)
      .pipe(takeUntil(this.destroyed$)).subscribe({
        next: items => {
          if (current !== this.generation || this.processId !== processId) return;
          this.queue = beforeId ? [...this.queue, ...items] : items;
          this.hasMore = items.length === 100;
          this.loading = false;
        },
        error: error => {
          if (current !== this.generation) return;
          this.loading = false;
          this.error = this.message(error);
        }
      });
  }

  nextPage(): void {
    if (!this.hasMore || this.loading || !this.queue.length) return;
    this.loadQueue(this.queue[this.queue.length - 1].id);
  }

  detail(item: ReviewQueueItem): void {
    if (this.communityId === null || this.busy) return;
    const id = this.communityId;
    const current = ++this.generation;
    this.selected = null;
    this.resetAssessment();
    this.busy = true;
    this.error = '';
    this.tracking.reviewDetail(id, item.id).pipe(takeUntil(this.destroyed$)).subscribe({
      next: value => {
        if (current !== this.generation) return;
        this.selected = value;
        this.busy = false;
      },
      error: error => {
        if (current !== this.generation) return;
        this.busy = false;
        this.error = this.message(error);
      }
    });
  }

  get answerEntries(): { question: string; answer: string }[] {
    const answers = this.selected?.candidateAnswers;
    if (!answers) return [];
    return Object.entries(answers).map(([question, value]) => ({
      question,
      answer: typeof value === 'string' ? value : JSON.stringify(value)
    }));
  }

  canAssess(stage: ReviewStage): boolean {
    return stage.stageType !== 'AUTO_EVALUATION' &&
      (stage.internalStatus === 'AWAITING_REVIEW' || stage.internalStatus === 'IN_PROGRESS');
  }

  openAssessment(stage: ReviewStage): void {
    if (this.communityId === null || !this.selected || !this.canAssess(stage)) return;
    const communityId = this.communityId;
    const applicationId = this.selected.application.id;
    const current = ++this.generation;
    this.resetAssessment();
    this.assessmentStage = stage;
    this.assessmentBusy = true;
    this.tracking.assessmentForm(communityId, applicationId, stage.stageId)
      .pipe(takeUntil(this.destroyed$)).subscribe({
        next: form => {
          if (this.generation !== current) return;
          this.assessmentForm = form;
          this.assessmentBusy = false;
        },
        error: err => {
          if (this.generation !== current) return;
          this.assessmentBusy = false;
          this.assessmentError = this.assessmentFailure(err);
        }
      });
    this.tracking.ownAssessment(communityId, applicationId, stage.stageId)
      .pipe(takeUntil(this.destroyed$)).subscribe({
        next: assessment => {
          if (this.generation !== current) return;
          this.savedAssessment = assessment;
        },
        error: err => {
          if (this.generation !== current || err.status === 404) return;
          this.assessmentError = this.assessmentFailure(err);
        }
      });
  }

  hasChoice(questionId: string, optionId: string): boolean {
    return Array.isArray(this.staffAnswers[questionId]) &&
      (this.staffAnswers[questionId] as string[]).includes(optionId);
  }

  toggleChoice(questionId: string, optionId: string, checked: boolean): void {
    const current = Array.isArray(this.staffAnswers[questionId])
      ? this.staffAnswers[questionId] as string[] : [];
    this.staffAnswers[questionId] = checked
      ? [...new Set([...current, optionId])]
      : current.filter(item => item !== optionId);
  }

  submitAssessment(): void {
    if (this.communityId === null || !this.selected || !this.assessmentStage ||
        !this.assessmentForm || this.savedAssessment || this.assessmentBusy) return;
    const communityId = this.communityId;
    const applicationId = this.selected.application.id;
    const stageId = this.assessmentStage.stageId;
    const current = this.generation;
    this.assessmentBusy = true;
    this.assessmentError = '';
    this.assessmentMessage = '';
    this.tracking.submitAssessment(communityId, applicationId, stageId, {
      score: this.score, opinion: this.opinion.trim() || null,
      staffAnswers: {...this.staffAnswers}
    }).pipe(takeUntil(this.destroyed$)).subscribe({
      next: value => {
        if (current !== this.generation) return;
        this.savedAssessment = value;
        this.assessmentBusy = false;
        this.assessmentMessage = 'Seu parecer foi registrado e não pode ser alterado.';
      },
      error: err => {
        if (current !== this.generation) return;
        this.assessmentBusy = false;
        this.assessmentError = this.assessmentFailure(err);
      }
    });
  }

  closeAssessment(): void {
    this.generation++;
    this.resetAssessment();
  }

  private resetAssessment(): void {
    this.assessmentForm = null;
    this.assessmentStage = null;
    this.savedAssessment = null;
    this.score = null;
    this.opinion = '';
    this.staffAnswers = {};
    this.assessmentBusy = false;
    this.assessmentError = '';
    this.assessmentMessage = '';
  }

  private assessmentFailure(error: {status?: number}): string {
    if (error.status === 403 || error.status === 404) {
      return 'Esta avaliação não está disponível para você nesta etapa.';
    }
    if (error.status === 409) return 'Avaliação já enviada ou etapa indisponível.';
    if (error.status === 400) return 'Revise as respostas obrigatórias e a nota informada.';
    return 'Não foi possível registrar a avaliação.';
  }

  private message(error: { status?: number }): string {
    if (error.status === 403) return 'Você não tem permissão para consultar esta candidatura.';
    if (error.status === 404) return 'Candidatura não encontrada nesta Community.';
    return 'Não foi possível consultar a fila de candidaturas.';
  }
}
