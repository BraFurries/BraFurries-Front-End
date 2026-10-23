import { Component, EventEmitter, Input, OnChanges, OnDestroy, Output } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { RecruitmentDecisionPolicy } from '../../../core/services/recruitment-decision-policy.service';
import {
  BallotChoice, RecruitmentCollectiveVotingService,
  RecruitmentVoteTally, RecruitmentVotingDecision
} from '../../../core/services/recruitment-collective-voting.service';

/** Manager-only. Backend enforces Community, quorum, policy, sequence and single decision. */
@Component({
  selector: 'app-recruitment-vote-tally',
  standalone: false,
  templateUrl: './recruitment-vote-tally.component.html'
})
export class RecruitmentVoteTallyComponent implements OnChanges, OnDestroy {
  @Input() communityId: number | null = null;
  @Input() applicationId: number | null = null;
  @Input() stageId: number | null = null;
  @Input() stageStatus = '';
  @Input() applicationStatus = '';
  @Input() assessmentCount = 0;
  @Input() policy: RecruitmentDecisionPolicy | null = null;
  @Input() evidenceTruncated = false;
  @Output() completed = new EventEmitter<RecruitmentVotingDecision>();

  tally: RecruitmentVoteTally | null = null;
  loading = false;
  busy = false;
  confirmed = false;
  overrideOutcome: BallotChoice = 'REJECT';
  overrideReason = '';
  error = '';
  private generation = 0;
  private identity = '';
  private readonly destroyed$ = new Subject<void>();

  constructor(private readonly votes: RecruitmentCollectiveVotingService) {}

  ngOnChanges(): void {
    const identity = `${this.communityId}:${this.applicationId}:${this.stageId}`;
    if (identity !== this.identity) {
      this.identity = identity;
      ++this.generation;
      this.tally = null;
      this.loading = false;
      this.busy = false;
      this.confirmed = false;
      this.overrideOutcome = 'REJECT';
      this.overrideReason = '';
      this.error = '';
      this.refresh();
    }
  }

  refresh(): void {
    if (this.communityId === null || this.applicationId === null ||
        this.stageId === null || this.busy) return;
    const generation = ++this.generation;
    const communityId = this.communityId;
    const applicationId = this.applicationId;
    const stageId = this.stageId;
    this.loading = true;
    this.tally = null;
    this.confirmed = false;
    this.error = '';
    this.votes.tally(communityId, applicationId, stageId)
      .pipe(takeUntil(this.destroyed$)).subscribe({
        next: result => {
          if (generation !== this.generation) return;
          this.tally = result;
          this.loading = false;
        },
        error: err => {
          if (generation !== this.generation) return;
          this.loading = false;
          this.error = this.failure(err);
        }
      });
  }

  get requiresOverride(): boolean {
    return !!this.tally?.tie && this.tally.tiePolicy === 'MANAGER_OVERRIDE';
  }

  get canFinalize(): boolean {
    return !this.loading && !this.busy && !this.evidenceTruncated &&
      !!this.tally && this.tally.quorumReached &&
      this.stageStatus === 'AWAITING_REVIEW' &&
      this.applicationStatus === 'IN_PROGRESS' &&
      this.policy?.decisionMode === 'AUTOMATIC_VOTE' &&
      this.assessmentCount >= this.policy.minimumAssessments &&
      (this.policy.minimumVotes ?? 0) >= 2 &&
      this.tally.quorum === this.policy.minimumVotes &&
      this.tally.tiePolicy === this.policy.tiePolicy &&
      (!this.requiresOverride || this.overrideReason.trim().length >= 10);
  }

  get canSubmit(): boolean {
    return this.canFinalize && this.confirmed &&
      (!this.requiresOverride || this.overrideReason.trim().length <= 1800);
  }

  finalize(): void {
    if (!this.canSubmit || !this.tally || this.communityId === null ||
        this.applicationId === null || this.stageId === null) return;
    const generation = this.generation;
    const override = this.requiresOverride
      ? {outcome: this.overrideOutcome, reason: this.overrideReason.trim()} : null;
    const communityId = this.communityId;
    const applicationId = this.applicationId;
    const stageId = this.stageId;
    this.busy = true;
    this.error = '';
    this.votes.finalize(communityId, applicationId, stageId, override)
      .pipe(takeUntil(this.destroyed$)).subscribe({
        next: result => {
          if (generation !== this.generation) return;
          this.busy = false;
          this.confirmed = false;
          this.overrideReason = '';
          this.tally = null;
          this.completed.emit(result);
        },
        error: err => {
          if (generation !== this.generation) return;
          this.busy = false;
          this.confirmed = false;
          this.error = this.failure(err);
          // Stale quorum/decision: require explicit refresh before another attempt.
          this.tally = null;
        }
      });
  }

  ngOnDestroy(): void {
    ++this.generation;
    this.tally = null;
    this.overrideReason = '';
    this.confirmed = false;
    this.destroyed$.next();
    this.destroyed$.complete();
  }

  private failure(err: {status?: number}): string {
    if (err.status === 409) {
      return 'Quórum, etapa ou decisão alterados. Atualize o placar e confira a candidatura.';
    }
    if (err.status === 403 || err.status === 404) {
      return 'Votação indisponível ou autorização de gestão revogada.';
    }
    if (err.status === 400) return 'Revise o desempate e sua justificativa.';
    return 'Não foi possível consultar ou consolidar os votos.';
  }
}
