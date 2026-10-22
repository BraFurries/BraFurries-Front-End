import { Component, Input, OnChanges, OnDestroy, SimpleChanges } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { CommunityTeamRole, CommunityTeamRolesService } from '../../../core/services/community-team-roles.service';
import {
  RecruitmentReviewableStage, RecruitmentReviewerAssignment,
  RecruitmentReviewerAssignmentsService
} from '../../../core/services/recruitment-reviewer-assignments.service';

/** A manage-processes-only UI: the API remains the authority for every grant. */
@Component({
  selector: 'app-recruitment-reviewers',
  standalone: false,
  templateUrl: './recruitment-reviewers.component.html'
})
export class RecruitmentReviewersComponent implements OnChanges, OnDestroy {
  @Input() communityId: number | null = null;
  @Input() processId: number | null = null;

  stages: RecruitmentReviewableStage[] = [];
  selectedStageId: number | null = null;
  assignments: RecruitmentReviewerAssignment[] = [];
  roles: CommunityTeamRole[] = [];
  rolesUnavailable = false;
  loading = false;
  detailLoading = false;
  saving = false;
  error = '';
  notice = '';
  assigneeType: 'user' | 'role' = 'role';
  userId: number | null = null;
  roleId: number | null = null;
  pendingRevokeId: number | null = null;

  private readonly destroyed$ = new Subject<void>();
  private contextGeneration = 0;
  private stageGeneration = 0;

  constructor(
    private readonly reviewers: RecruitmentReviewerAssignmentsService,
    private readonly teamRoles: CommunityTeamRolesService
  ) {}

  ngOnChanges(_changes: SimpleChanges): void {
    const generation = ++this.contextGeneration;
    this.stageGeneration++;
    this.stages = [];
    this.selectedStageId = null;
    this.assignments = [];
    this.roles = [];
    this.rolesUnavailable = false;
    this.userId = null;
    this.roleId = null;
    this.pendingRevokeId = null;
    this.error = '';
    this.notice = '';
    this.loading = false;
    this.detailLoading = false;
    this.saving = false;
    const communityId = this.communityId;
    const processId = this.processId;
    if (communityId === null || processId === null) return;
    this.loading = true;
    this.reviewers.stages(communityId, processId)
      .pipe(takeUntil(this.destroyed$)).subscribe({
        next: stages => {
          if (generation !== this.contextGeneration) return;
          this.stages = stages;
          this.loading = false;
          if (stages.length) this.selectStage(stages[0].stageId);
        },
        error: err => {
          if (generation !== this.contextGeneration) return;
          this.loading = false;
          this.error = this.failure(err);
        }
      });
    this.teamRoles.listCommunity(communityId)
      .pipe(takeUntil(this.destroyed$)).subscribe({
        next: roles => {
          if (generation !== this.contextGeneration) return;
          this.roles = roles;
        },
        error: () => {
          if (generation !== this.contextGeneration) return;
          this.rolesUnavailable = true;
        }
      });
  }

  ngOnDestroy(): void {
    this.contextGeneration++;
    this.stageGeneration++;
    this.destroyed$.next();
    this.destroyed$.complete();
  }

  selectStage(stageId: number): void {
    const communityId = this.communityId;
    if (communityId === null || !this.stages.some(stage => stage.stageId === stageId)) return;
    const context = this.contextGeneration;
    const request = ++this.stageGeneration;
    this.selectedStageId = stageId;
    this.assignments = [];
    this.pendingRevokeId = null;
    this.error = '';
    this.notice = '';
    this.detailLoading = true;
    this.reviewers.list(communityId, stageId)
      .pipe(takeUntil(this.destroyed$)).subscribe({
        next: assignments => {
          if (context !== this.contextGeneration || request !== this.stageGeneration) return;
          this.assignments = assignments;
          this.detailLoading = false;
        },
        error: err => {
          if (context !== this.contextGeneration || request !== this.stageGeneration) return;
          this.detailLoading = false;
          this.error = this.failure(err);
        }
      });
  }

  get selectedStage(): RecruitmentReviewableStage | undefined {
    return this.stages.find(stage => stage.stageId === this.selectedStageId);
  }

  get validTargetId(): number | null {
    const id = this.assigneeType === 'user' ? this.userId : this.roleId;
    return id !== null && Number.isSafeInteger(id) && id > 0 ? id : null;
  }

  get canAssign(): boolean {
    return this.selectedStageId !== null && !this.saving && !this.detailLoading
      && this.validTargetId !== null;
  }

  assign(): void {
    const communityId = this.communityId;
    const stageId = this.selectedStageId;
    const id = this.validTargetId;
    if (communityId === null || stageId === null || id === null || !this.canAssign) return;
    const context = this.contextGeneration;
    const stage = this.stageGeneration;
    this.saving = true;
    this.error = '';
    this.notice = '';
    const request = this.assigneeType === 'user'
      ? { userId: id, roleId: null }
      : { userId: null, roleId: id };
    this.reviewers.assign(communityId, stageId, request)
      .pipe(takeUntil(this.destroyed$)).subscribe({
        next: response => {
          if (context !== this.contextGeneration || stage !== this.stageGeneration) return;
          this.assignments = [...this.assignments, response];
          this.saving = false;
          this.userId = null;
          this.roleId = null;
          this.notice = 'Responsável designado para esta etapa.';
        },
        error: err => {
          if (context !== this.contextGeneration || stage !== this.stageGeneration) return;
          this.saving = false;
          this.error = this.failure(err);
        }
      });
  }

  revoke(assignmentId: number): void {
    if (this.pendingRevokeId !== assignmentId) {
      this.pendingRevokeId = assignmentId;
      return;
    }
    const communityId = this.communityId;
    const stageId = this.selectedStageId;
    if (communityId === null || stageId === null || this.saving) return;
    const context = this.contextGeneration;
    const stage = this.stageGeneration;
    this.saving = true;
    this.error = '';
    this.reviewers.revoke(communityId, stageId, assignmentId)
      .pipe(takeUntil(this.destroyed$)).subscribe({
        next: () => {
          if (context !== this.contextGeneration || stage !== this.stageGeneration) return;
          this.assignments = this.assignments.filter(item => item.id !== assignmentId);
          this.pendingRevokeId = null;
          this.saving = false;
          this.notice = 'Designação revogada.';
        },
        error: err => {
          if (context !== this.contextGeneration || stage !== this.stageGeneration) return;
          this.saving = false;
          this.pendingRevokeId = null;
          this.error = this.failure(err);
        }
      });
  }

  assigneeLabel(item: RecruitmentReviewerAssignment): string {
    if (item.userId !== null) return 'Usuário interno #' + item.userId;
    const role = this.roles.find(r => r.id === item.roleId);
    return role ? 'Cargo: ' + role.name : 'Cargo interno #' + item.roleId;
  }

  private failure(err: { status?: number }): string {
    if (err.status === 403 || err.status === 404) {
      return 'A etapa não está disponível ou você perdeu a permissão de gestão.';
    }
    if (err.status === 409) return 'O responsável já foi designado ou houve uma alteração simultânea.';
    if (err.status === 400) return 'Verifique se o membro ou cargo pertence a esta Community.';
    return 'Não foi possível atualizar os responsáveis desta etapa.';
  }
}
