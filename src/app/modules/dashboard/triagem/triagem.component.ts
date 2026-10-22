import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { CommunityContextService } from '../../../core/services/community-context.service';
import {
  RecruitmentTrackingService, ReviewableRecruitmentProcess,
  ReviewApplication, ReviewQueueItem
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

  private message(error: { status?: number }): string {
    if (error.status === 403) return 'Você não tem permissão para consultar esta candidatura.';
    if (error.status === 404) return 'Candidatura não encontrada nesta Community.';
    return 'Não foi possível consultar a fila de candidaturas.';
  }
}
