import { Component, EventEmitter, Input, OnChanges, OnDestroy, Output } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import {
  RecruitmentDecisionPolicy, RecruitmentDecisionPolicyService, ReviewMode
} from '../../../core/services/recruitment-decision-policy.service';

@Component({
  selector: 'app-recruitment-stage-policy',
  standalone: false,
  templateUrl: './recruitment-stage-policy.component.html'
})
export class RecruitmentStagePolicyComponent implements OnChanges, OnDestroy {
  @Input() communityId: number | null = null;
  @Input() processId: number | null = null;
  @Input() stageId: number | null = null;
  @Input() stageType = '';
  @Input() expectedRevision = 0;
  @Input() editable = false;
  @Output() saved = new EventEmitter<number>();

  policy: RecruitmentDecisionPolicy = {
    reviewMode: 'INDIVIDUAL', decisionMode: 'MANUAL', minimumAssessments: 1
  };
  loading = false;
  busy = false;
  error = '';
  notice = '';
  versionStatus = '';
  private readonly destroyed$ = new Subject<void>();
  private generation = 0;
  private loadedIdentity: string | null = null;

  constructor(private readonly service: RecruitmentDecisionPolicyService) {}

  ngOnChanges(): void {
    const identity = this.communityId === null || this.processId === null || this.stageId === null
      ? null : `${this.communityId}:${this.processId}:${this.stageId}`;
    // Revision and editable flag changes must not discard unsaved form contents.
    if (identity === this.loadedIdentity) return;
    this.loadedIdentity = identity;
    const generation = ++this.generation;
    this.policy = {reviewMode:'INDIVIDUAL', decisionMode:'MANUAL', minimumAssessments:1};
    this.error = '';
    this.notice = '';
    this.versionStatus = '';
    this.loading = false;
    this.busy = false;
    if (this.communityId === null || this.processId === null || this.stageId === null) return;
    const communityId = this.communityId;
    const processId = this.processId;
    const stageId = this.stageId;
    this.loading = true;
    this.service.get(communityId,processId,stageId).pipe(takeUntil(this.destroyed$)).subscribe({
      next: result => {
        if (generation !== this.generation) return;
        this.policy = {...result.policy};
        this.versionStatus = result.versionStatus;
        this.loading = false;
      },
      error: error => {
        if (generation !== this.generation) return;
        this.loading = false;
        this.error = this.failure(error);
      }
    });
  }

  ngOnDestroy(): void {
    this.generation++;
    this.destroyed$.next();
    this.destroyed$.complete();
  }

  get canSave(): boolean {
    return !this.loading && !this.busy && this.editable && this.versionStatus === 'DRAFT'
      && this.stageType !== 'AUTO_EVALUATION' && Number.isInteger(this.policy.minimumAssessments)
      && this.policy.minimumAssessments >= (this.policy.reviewMode === 'COLLECTIVE' ? 2 : 1)
      && this.policy.minimumAssessments <= 20
      && (this.policy.reviewMode !== 'INDIVIDUAL' || this.policy.minimumAssessments === 1)
      && (this.policy.decisionMode !== 'AUTOMATIC_VOTE'
        || this.policy.reviewMode === 'COLLECTIVE');
  }

  changeMode(mode: ReviewMode): void {
    this.policy.reviewMode = mode;
    this.policy.minimumAssessments = mode === 'INDIVIDUAL' ? 1 : 2;
    if (mode === 'INDIVIDUAL') this.policy.decisionMode = 'MANUAL';
    this.notice = '';
  }

  savePolicy(): void {
    if (!this.canSave || this.communityId === null ||
        this.processId === null || this.stageId === null) return;
    const generation = this.generation;
    const communityId = this.communityId;
    const processId = this.processId;
    const stageId = this.stageId;
    this.busy = true;
    this.error = '';
    this.notice = '';
    this.service.save(communityId,processId,stageId,
      this.expectedRevision,{...this.policy})
      .pipe(takeUntil(this.destroyed$)).subscribe({
        next: result => {
          if (generation !== this.generation) return;
          this.busy = false;
          this.versionStatus = result.versionStatus;
          this.policy = {...result.policy};
          this.notice = 'Política salva no rascunho.';
          this.saved.emit(result.draftRevision);
        },
        error: error => {
          if (generation !== this.generation) return;
          this.busy = false;
          this.error = this.failure(error);
        }
      });
  }

  private failure(error: {status?: number}): string {
    if (error.status === 409) return 'Rascunho desatualizado ou já publicado. Recarregue.';
    if (error.status === 403 || error.status === 404) return 'Política indisponível nesta Community.';
    if (error.status === 400) return 'Modo de decisão ou quantidade de pareceres inválidos.';
    return 'Não foi possível consultar ou salvar a política.';
  }
}
