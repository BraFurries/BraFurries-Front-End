import { Component, Input, OnChanges, OnDestroy } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import {
  BallotChoice, OwnRecruitmentBallot, RecruitmentCollectiveVotingService
} from '../../../core/services/recruitment-collective-voting.service';

/** Reviewer-only UI: never fetches other votes or the management tally. */
@Component({
  selector: 'app-recruitment-own-ballot',
  standalone: false,
  templateUrl: './recruitment-own-ballot.component.html'
})
export class RecruitmentOwnBallotComponent implements OnChanges, OnDestroy {
  @Input() communityId: number | null = null;
  @Input() applicationId: number | null = null;
  @Input() stageId: number | null = null;
  @Input() stageStatus = '';
  @Input() assessmentSubmitted = false;

  ballot: OwnRecruitmentBallot | null = null;
  available = false;
  choice: BallotChoice = 'APPROVE';
  confirmed = false;
  loading = false;
  saving = false;
  error = '';
  notice = '';

  private readonly destroyed$ = new Subject<void>();
  private generation = 0;
  private identity = '';

  constructor(private readonly votes: RecruitmentCollectiveVotingService) {}

  ngOnChanges(): void {
    const identity = `${this.communityId}:${this.applicationId}:${this.stageId}:${this.stageStatus}:${this.assessmentSubmitted}`;
    if (identity === this.identity) return;
    this.identity = identity;
    const generation = ++this.generation;
    this.ballot = null;
    this.available = false;
    this.choice = 'APPROVE';
    this.confirmed = false;
    this.loading = false;
    this.saving = false;
    this.error = '';
    this.notice = '';
    if (!this.assessmentSubmitted || this.communityId === null ||
        this.applicationId === null || this.stageId === null ||
        this.stageStatus !== 'AWAITING_REVIEW') return;

    const communityId = this.communityId;
    const applicationId = this.applicationId;
    const stageId = this.stageId;
    this.loading = true;
    this.votes.availability(communityId, applicationId, stageId)
      .pipe(takeUntil(this.destroyed$)).subscribe({
        next: availability => {
          if (generation !== this.generation) return;
          this.available = availability.enabled && availability.hasAssessment;
          if (!this.available || !availability.alreadyVoted) {
            this.loading = false;
            return;
          }
          this.votes.mine(communityId, applicationId, stageId)
            .pipe(takeUntil(this.destroyed$)).subscribe({
              next: ballot => {
                if (generation !== this.generation) return;
                this.ballot = ballot;
                this.loading = false;
              },
              error: err => {
                if (generation !== this.generation) return;
                this.loading = false;
                this.available = false;
                this.error = this.failure(err);
              }
            });
        },
        error: err => {
          if (generation !== this.generation) return;
          this.loading = false;
          this.available = false;
          this.error = this.failure(err);
        }
      });
  }

  get canCast(): boolean {
    return this.available && this.assessmentSubmitted && this.stageStatus === 'AWAITING_REVIEW' &&
      !this.ballot && !this.loading && !this.saving && this.confirmed &&
      (this.choice === 'APPROVE' || this.choice === 'REJECT');
  }

  cast(): void {
    if (!this.canCast || this.communityId === null ||
        this.applicationId === null || this.stageId === null) return;
    const generation = this.generation;
    const communityId = this.communityId;
    const applicationId = this.applicationId;
    const stageId = this.stageId;
    this.saving = true;
    this.error = '';
    this.notice = '';
    this.votes.cast(communityId, applicationId, stageId, this.choice)
      .pipe(takeUntil(this.destroyed$)).subscribe({
        next: ballot => {
          if (generation !== this.generation) return;
          this.ballot = ballot;
          this.saving = false;
          this.confirmed = false;
          this.notice = 'Seu voto individual foi registrado. Nenhuma decisão ou resultado foi publicado.';
        },
        error: err => {
          if (generation !== this.generation) return;
          this.saving = false;
          this.confirmed = false;
          this.error = this.failure(err);
          // On duplicate/stale status, read the own ballot again after a user refresh.
        }
      });
  }

  ngOnDestroy(): void {
    ++this.generation;
    this.ballot = null;
    this.available = false;
    this.choice = 'APPROVE';
    this.confirmed = false;
    this.destroyed$.next();
    this.destroyed$.complete();
  }

  private failure(err: {status?: number}): string {
    if (err.status === 409) {
      return 'Votação indisponível nesta etapa ou voto já registrado. Feche e reabra para atualizar.';
    }
    if (err.status === 403 || err.status === 404) {
      return 'Você não possui acesso à votação desta etapa.';
    }
    if (err.status === 400) return 'Selecione um voto válido.';
    return 'Não foi possível consultar ou registrar seu voto.';
  }
}
