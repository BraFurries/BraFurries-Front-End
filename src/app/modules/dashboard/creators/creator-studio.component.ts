import { Component, OnDestroy, OnInit } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Subject, forkJoin, distinctUntilChanged, takeUntil } from 'rxjs';
import {
  CreatorCommission,
  CreatorCommissionInput,
  CreatorCommissionStatus,
  CreatorCommissionStep,
  CreatorStepStatus,
  CreatorArtType,
  CreatorStageDefinition,
  CreatorWorkflow,
  CreatorStudioAccess,
  CreatorRetentionOverview,
  CreatorRetentionWarning,
  CreatorStudioService
} from '../../../core/services/creator-studio.service';
import { UserService } from '../../../core/services/user.service';

/**
 * The first private Pro workflow: a fast commission card and chronological queue.
 * Backend always re-checks entitlement and ownership; UI checks only control display.
 */
@Component({
  selector: 'app-creator-studio',
  standalone: false,
  templateUrl: './creator-studio.component.html'
})
export class CreatorStudioComponent implements OnInit, OnDestroy {
  readonly statuses: { value: CreatorCommissionStatus; label: string }[] = [
    { value: 'QUEUED', label: 'Na fila' },
    { value: 'IN_PROGRESS', label: 'Em produção' },
    { value: 'WAITING', label: 'Aguardando retorno' },
    { value: 'PAUSED', label: 'Em pausa' },
    { value: 'COMPLETED', label: 'Concluída' }
  ];
  readonly pageSize = 25;
  readonly stepStatuses: {value: CreatorStepStatus; label: string}[] = [
    {value: 'PENDING', label: 'Pendente'},
    {value: 'IN_PROGRESS', label: 'Em execução'},
    {value: 'WAITING_APPROVAL', label: 'Aguardando aprovação'},
    {value: 'DONE', label: 'Finalizada'}
  ];
  artTypes: CreatorArtType[] = [];
  definitions: CreatorStageDefinition[] = [];
  workflows: CreatorWorkflow[] = [];
  // Kanban is the default; the chronological list remains available for detail work.
  viewMode: 'board' | 'list' = 'board';
  groupBy: 'date' | 'type' | 'status' | 'stage' = 'date';
  readonly boardStatuses: CreatorCommissionStatus[] =
    ['QUEUED','IN_PROGRESS','WAITING','PAUSED'];
  readonly boardPageSize = 12;
  boardColumns: {status: CreatorCommissionStatus; items: CreatorCommission[]; total: number}[] =
    this.boardStatuses.map(status => ({status,items:[],total:0}));
  boardLoading = false;
  boardError = '';
  private boardSequence = 0;
  expandedCommissionId: number | null = null;
  steps: CreatorCommissionStep[] = [];
  loadingSteps = false;
  stepBusy = false;
  stepError = '';
  newStepName = '';
  newStepDefinitionId: number | null = null;
  importWorkflowId: number | null = null;
  private stepsSequence = 0;
  retention: CreatorRetentionOverview | null = null;
  retentionLoading = false;
  retentionError = '';
  exporting = false;
  exportError = '';
  exportSuccess = '';

  loadingAccess = true;
  access: CreatorStudioAccess | null = null;
  accessError = '';
  loading = false;
  errorMessage = '';
  saving = false;
  saveError = '';
  changingId: number | null = null;
  commissions: CreatorCommission[] = [];
  total = 0;
  page = 1;
  selectedStatus: CreatorCommissionStatus | 'ACTIVE' = 'ACTIVE';

  formOpen = false;
  editingId: number | null = null;
  form: CreatorCommissionInput = this.emptyForm();

  private accessSequence = 0;
  private listSequence = 0;
  // Angular evaluates template getters on every change detection pass. Without
  // memoization, new group object identities make *ngFor destroy/recreate every
  // card and its ngModel controls, resulting in a render/check loop.
  private groupedSource: CreatorCommission[] | null = null;
  private groupedBy: typeof this.groupBy | null = null;
  private groupedCache: { key: string; label: string; items: CreatorCommission[] }[] = [];
  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly creatorStudio: CreatorStudioService,
    private readonly users: UserService
  ) {}

  ngOnInit(): void {
    this.users.user$
      .pipe(
        distinctUntilChanged((a, b) => a?.id === b?.id),
        takeUntil(this.destroy$)
      )
      .subscribe(user => {
        const sequence = ++this.accessSequence;
        this.listSequence++;
        this.boardSequence++;
        this.boardColumns = this.boardStatuses.map(status => ({status,items:[],total:0}));
        this.boardLoading = false;
        this.boardError = '';
        this.access = null;
        this.accessError = '';
        this.loadingAccess = user !== null;
        this.commissions = [];
        this.total = 0;
        this.page = 1;
        this.formOpen = false;
        this.editingId = null;
        this.saving = false;
        this.changingId = null;
        this.stepsSequence++;
        this.expandedCommissionId = null;
        this.steps = [];
        this.artTypes = [];
        this.definitions = [];
        this.workflows = [];
        this.loadingSteps = false;
        this.stepBusy = false;
        this.stepError = '';
        this.retention = null;
        this.retentionLoading = false;
        this.retentionError = '';
        this.exporting = false;
        this.exportError = '';
        this.exportSuccess = '';
        if (!user) {
          this.accessError = 'Entre na sua conta para acessar o Creator Studio.';
          return;
        }
        const userId = user.id;
        this.loadRetention(sequence, userId);
        this.creatorStudio.myAccess().pipe(takeUntil(this.destroy$)).subscribe({
          next: access => {
            if (this.accessSequence !== sequence || this.users.getUser()?.id !== userId) return;
            this.loadingAccess = false;
            this.access = access;
            if (this.canUsePro) {
              this.reloadCatalog();
              this.reload();
            }
          },
          error: () => {
            if (this.accessSequence !== sequence || this.users.getUser()?.id !== userId) return;
            this.loadingAccess = false;
            this.accessError = 'Não foi possível verificar seu acesso. Tente novamente.';
          }
        });
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get canUsePro(): boolean {
    return this.access?.allowed === true && this.access.tier === 'PRO';
  }

  retentionWarningLabel(level: CreatorRetentionWarning): string {
    if (level === 'OVERDUE') return 'Prazo de retenção encerrado';
    if (level === 'FINAL_7_DAYS') return 'Até 7 dias para o vencimento';
    return 'Até 30 dias para o vencimento';
  }

  private loadRetention(seq: number, userId: number): void {
    this.retentionLoading = true;
    this.creatorStudio.retention().pipe(takeUntil(this.destroy$)).subscribe({
      next: result => {
        if (seq !== this.accessSequence || this.users.getUser()?.id !== userId) return;
        this.retentionLoading = false;
        this.retention = result;
      },
      error: () => {
        if (seq !== this.accessSequence || this.users.getUser()?.id !== userId) return;
        this.retentionLoading = false;
        this.retentionError = 'Não foi possível consultar os prazos de retenção.';
      }
    });
  }

  downloadMyData(): void {
    if (!this.users.getUser() || this.exporting) return;
    const seq = this.accessSequence;
    const account = this.users.getUser()?.id;
    this.exporting = true;
    this.exportError = '';
    this.exportSuccess = '';
    this.creatorStudio.exportMyData().pipe(takeUntil(this.destroy$)).subscribe({
      next: blob => {
        if (seq !== this.accessSequence || this.users.getUser()?.id !== account) return;
        this.exporting = false;
        if (!blob.size) {
          this.exportError = 'O arquivo exportado está vazio. Tente novamente.';
          return;
        }
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'creator-studio-meus-dados.json';
        document.body.appendChild(link);
        link.click();
        link.remove();
        // Some mobile browsers start attachment downloads asynchronously.
        setTimeout(() => URL.revokeObjectURL(url), 1500);
        this.exportSuccess = 'Exportação disponibilizada para download.';
      },
      error: () => {
        if (seq !== this.accessSequence || this.users.getUser()?.id !== account) return;
        this.exporting = false;
        this.exportError = 'Não foi possível exportar os dados. Tente novamente.';
      }
    });
  }

  get activeCount(): number {
    return this.boardColumns.reduce((sum, col) => sum + col.total, 0);
  }

  setViewMode(mode: 'board' | 'list'): void {
    if (mode === this.viewMode || !this.canUsePro) return;
    this.viewMode = mode;
    this.listSequence++;
    this.boardSequence++;
    this.page = 1;
    this.expandedCommissionId = null;
    this.stepsSequence++;
    this.reload();
  }

  showStatusList(status: CreatorCommissionStatus): void {
    if (!this.canUsePro) return;
    this.viewMode = 'list';
    this.listSequence++;
    this.boardSequence++;
    this.selectedStatus = status;
    this.page = 1;
    this.reload();
  }

  get pageCount(): number {
    return Math.max(1, Math.ceil(this.total / this.pageSize));
  }

  get groupedCommissions(): { key: string; label: string; items: CreatorCommission[] }[] {
    // Keep the same group references as long as input data and grouping choice
    // are unchanged. This prevents repeated DOM teardown / ngModel registration.
    if (this.groupedSource === this.commissions && this.groupedBy === this.groupBy) {
      return this.groupedCache;
    }
    const groups = new Map<string, { key: string; label: string; items: CreatorCommission[] }>();
    for (const card of this.commissions) {
      let key = card.requestedOn;
      let label = this.formatCivilDate(card.requestedOn);
      if (this.groupBy === 'status') {
        key = card.status;
        label = this.statusLabel(card.status);
      } else if (this.groupBy === 'type') {
        key = String(card.artTypeId ?? 'none');
        label = this.typeName(card.artTypeId);
      } else if (this.groupBy === 'stage') {
        key = card.currentStageDefinitionId != null
          ? 'shared:' + card.currentStageDefinitionId
          : 'custom:' + (card.currentStageName || 'none');
        label = card.currentStageName || 'Sem etapa atual';
      }
      if (!groups.has(key)) groups.set(key, {key,label,items:[]});
      groups.get(key)!.items.push(card);
    }
    this.groupedSource = this.commissions;
    this.groupedBy = this.groupBy;
    this.groupedCache = [...groups.values()];
    return this.groupedCache;
  }

  trackByGroup(_index: number, group: {key: string}): string {
    return group.key;
  }

  typeName(id: number | null): string {
    return this.artTypes.find(type => type.id === id)?.name || 'Sem tipo de arte';
  }

  private reportCatalogError(seq: number, userId: number | undefined): void {
    if (seq !== this.accessSequence || this.users.getUser()?.id !== userId) return;
    this.errorMessage = 'Não foi possível carregar seus tipos e modelos. Recarregue para tentar novamente.';
  }

  private reloadCatalog(): void {
    const seq = this.accessSequence;
    const userId = this.users.getUser()?.id;
    this.creatorStudio.artTypes().pipe(takeUntil(this.destroy$)).subscribe({
      next: rows => {
        if (seq === this.accessSequence && this.users.getUser()?.id === userId)
          this.artTypes = rows;
      },
      error: () => this.reportCatalogError(seq, userId)
    });
    this.creatorStudio.workflows().pipe(takeUntil(this.destroy$)).subscribe({
      next: rows => {
        if (seq === this.accessSequence && this.users.getUser()?.id === userId)
          this.workflows = rows;
      },
      error: () => this.reportCatalogError(seq, userId)
    });
    this.creatorStudio.stageDefinitions().pipe(takeUntil(this.destroy$)).subscribe({
      next: rows => {
        if (seq === this.accessSequence && this.users.getUser()?.id === userId)
          this.definitions = rows;
      },
      error: () => this.reportCatalogError(seq, userId)
    });
  }


  statusLabel(status: CreatorCommissionStatus): string {
    return this.statuses.find(option => option.value === status)?.label ?? status;
  }

  formatCivilDate(date: string | null): string {
    if (!date) return '';
    const [year, month, day] = date.slice(0, 10).split('-');
    return year && month && day ? `${day}/${month}/${year}` : date;
  }

  reload(): void {
    if (!this.canUsePro) return;
    if (this.viewMode === 'board') {
      this.loadBoard();
      return;
    }
    const seq = ++this.listSequence;
    const userId = this.users.getUser()?.id;
    this.errorMessage = '';
    this.loading = true;
    this.creatorStudio.commissions(
      this.selectedStatus === 'ACTIVE' ? null : this.selectedStatus,
      this.page,
      this.pageSize
    ).pipe(takeUntil(this.destroy$)).subscribe({
      next: result => {
        if (seq !== this.listSequence || this.users.getUser()?.id !== userId ||
            this.viewMode !== 'list') return;
        this.commissions = result.items;
        this.total = result.total;
        this.loading = false;
      },
      error: error => {
        if (seq !== this.listSequence || this.users.getUser()?.id !== userId ||
            this.viewMode !== 'list') return;
        this.loading = false;
        this.errorMessage = error instanceof HttpErrorResponse && error.status === 403
          ? 'Seu acesso ao Pro não está mais ativo. Recarregue a página para verificar.'
          : 'Não conseguimos carregar a fila. Tente novamente.';
      }
    });
  }

  private loadBoard(): void {
    const seq = ++this.boardSequence;
    const account = this.users.getUser()?.id;
    this.boardError = '';
    this.boardLoading = true;
    // Separate paginated requests keep correct per-lane totals without
    // assuming that one global page contains all statuses.
    forkJoin(this.boardStatuses.map(status =>
      this.creatorStudio.commissions(status,1,this.boardPageSize)
    )).pipe(takeUntil(this.destroy$)).subscribe({
      next: pages => {
        if (seq !== this.boardSequence || this.users.getUser()?.id !== account ||
            this.viewMode !== 'board') return;
        this.boardColumns = this.boardStatuses.map((status,i) => ({
          status, items:pages[i].items, total:pages[i].total
        }));
        this.boardLoading = false;
      },
      error: err => {
        if (seq !== this.boardSequence || this.users.getUser()?.id !== account) return;
        this.boardLoading = false;
        this.boardError = err instanceof HttpErrorResponse && err.status === 403
          ? 'Seu acesso ao Pro não está mais ativo. Recarregue a página.'
          : 'Não foi possível carregar todas as filas. Tente novamente.';
        this.boardColumns = this.boardStatuses.map(status => ({status,items:[],total:0}));
      }
    });
  }

  filterChanged(): void {
    this.page = 1;
    this.expandedCommissionId = null;
    this.stepsSequence++;
    this.reload();
  }

  previousPage(): void {
    if (this.page <= 1 || this.loading) return;
    this.page--;
    this.reload();
  }

  nextPage(): void {
    if (this.page >= this.pageCount || this.loading) return;
    this.page++;
    this.reload();
  }

  newCommission(): void {
    if (!this.canUsePro) return;
    this.editingId = null;
    this.form = this.emptyForm();
    this.formOpen = true;
    this.saveError = '';
  }

  editCommission(commission: CreatorCommission): void {
    if (!this.canUsePro) return;
    this.editingId = commission.id;
    this.form = {
      title: commission.title,
      clientName: commission.clientName,
      description: commission.description ?? '',
      privateNotes: commission.privateNotes ?? '',
      requestedOn: commission.requestedOn,
      dueOn: commission.dueOn,
      artTypeId: commission.artTypeId,
      workflowId: null
    };
    this.formOpen = true;
    this.saveError = '';
  }

  closeForm(): void {
    if (this.saving) return;
    this.formOpen = false;
    this.editingId = null;
    this.saveError = '';
  }

  save(): void {
    if (!this.canUsePro || this.saving) return;
    const title = this.form.title.trim();
    const clientName = this.form.clientName.trim();
    if (!title || !clientName || !this.form.requestedOn) {
      this.saveError = 'Informe o título, o cliente e a data original do pedido.';
      return;
    }
    const data: CreatorCommissionInput = {
      ...this.form,
      title,
      clientName,
      description: this.form.description?.trim() || null,
      privateNotes: this.form.privateNotes?.trim() || null,
      dueOn: this.form.dueOn || null
    };
    this.saving = true;
    this.saveError = '';
    const operation = this.editingId === null
      ? this.creatorStudio.create(data)
      : this.creatorStudio.update(this.editingId, data);
    const userId = this.users.getUser()?.id;
    operation.pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        if (this.users.getUser()?.id !== userId) return;
        this.saving = false;
        this.formOpen = false;
        this.editingId = null;
        this.page = 1;
        this.reload();
      },
      error: error => {
        if (this.users.getUser()?.id !== userId) return;
        this.saving = false;
        this.saveError = error instanceof HttpErrorResponse && error.status === 403
          ? 'Sua assinatura Pro não está ativa.'
          : 'Não foi possível salvar. Confira os campos e tente novamente.';
      }
    });
  }

  changeStatus(commission: CreatorCommission, status: CreatorCommissionStatus): void {
    if (!this.canUsePro || this.changingId !== null || commission.status === status) return;
    this.changingId = commission.id;
    this.errorMessage = '';
    const userId = this.users.getUser()?.id;
    this.creatorStudio.changeStatus(commission.id, status)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          if (this.users.getUser()?.id !== userId) return;
          this.changingId = null;
          // Completion is not deletion: the server excludes it from the active queue.
          this.reload();
        },
        error: () => {
          if (this.users.getUser()?.id !== userId) return;
          this.changingId = null;
          this.errorMessage = 'Não foi possível atualizar o status. Tente novamente.';
        }
      });
  }

  toggleSteps(commission: CreatorCommission): void {
    if (!this.canUsePro) return;
    if (this.expandedCommissionId === commission.id) {
      this.stepsSequence++;
      this.expandedCommissionId = null;
      this.steps = [];
      return;
    }
    this.expandedCommissionId = commission.id;
    this.steps = [];
    this.newStepName = '';
    this.newStepDefinitionId = null;
    this.importWorkflowId = null;
    this.loadSteps(commission.id);
  }

  private loadSteps(commissionId: number): void {
    const seq = ++this.stepsSequence;
    const account = this.users.getUser()?.id;
    this.loadingSteps = true;
    this.stepError = '';
    this.creatorStudio.commissionSteps(commissionId)
      .pipe(takeUntil(this.destroy$)).subscribe({
        next: rows => {
          if (seq !== this.stepsSequence || this.users.getUser()?.id !== account ||
              this.expandedCommissionId !== commissionId) return;
          this.steps = rows;
          this.loadingSteps = false;
        },
        error: () => {
          if (seq !== this.stepsSequence || this.users.getUser()?.id !== account) return;
          this.loadingSteps = false;
          this.stepError = 'Não conseguimos carregar as etapas deste pedido.';
        }
      });
  }

  setDefinition(id: number | null): void {
    this.newStepDefinitionId = id;
    const found = this.definitions.find(d => d.id === id);
    if (found) this.newStepName = found.name;
  }

  addStep(commissionId: number): void {
    if (!this.canUsePro || this.stepBusy || !this.newStepName.trim()) return;
    const account = this.users.getUser()?.id;
    this.stepBusy = true;
    this.stepError = '';
    this.creatorStudio.addCommissionStep(commissionId, {
      name: this.newStepName.trim(),
      stageDefinitionId: this.newStepDefinitionId
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        if (this.users.getUser()?.id !== account) return;
        this.stepBusy = false;
        this.newStepName = '';
        this.newStepDefinitionId = null;
        this.loadSteps(commissionId);
        this.reload();
      },
      error: () => {
        if (this.users.getUser()?.id !== account) return;
        this.stepBusy = false;
        this.stepError = 'Não foi possível adicionar a etapa.';
      }
    });
  }

  copyWorkflow(commissionId: number): void {
    if (!this.canUsePro || this.stepBusy || this.importWorkflowId == null ||
        this.steps.length > 0) return;
    const account = this.users.getUser()?.id;
    this.stepBusy = true;
    this.stepError = '';
    this.creatorStudio.copyWorkflowToCommission(commissionId, this.importWorkflowId)
      .pipe(takeUntil(this.destroy$)).subscribe({
        next: () => {
          if (this.users.getUser()?.id !== account) return;
          this.stepBusy = false;
          this.importWorkflowId = null;
          this.loadSteps(commissionId);
          this.reload();
        },
        error: () => {
          if (this.users.getUser()?.id !== account) return;
          this.stepBusy = false;
          this.stepError = 'Não foi possível aplicar o modelo. Ele só pode ser copiado antes de criar etapas.';
        }
      });
  }

  saveStep(step: CreatorCommissionStep): void {
    if (!this.canUsePro || this.stepBusy || !step.name.trim()) return;
    const account = this.users.getUser()?.id;
    this.stepBusy = true;
    this.stepError = '';
    this.creatorStudio.updateCommissionStep(step.commissionId, step.id, {
      name: step.name.trim(),
      stageDefinitionId: step.stageDefinitionId,
      status: step.status,
      notes: step.notes
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        if (this.users.getUser()?.id !== account) return;
        this.stepBusy = false;
        this.loadSteps(step.commissionId);
        this.reload();
      },
      error: () => {
        if (this.users.getUser()?.id !== account) return;
        this.stepBusy = false;
        this.stepError = 'Não foi possível salvar o andamento da etapa.';
      }
    });
  }

  removeStep(step: CreatorCommissionStep): void {
    if (!this.canUsePro || this.stepBusy ||
        !window.confirm('Excluir esta etapa e suas anotações deste pedido?')) return;
    const account = this.users.getUser()?.id;
    this.stepBusy = true;
    this.creatorStudio.deleteCommissionStep(step.commissionId, step.id)
      .pipe(takeUntil(this.destroy$)).subscribe({
        next: () => {
          if (this.users.getUser()?.id !== account) return;
          this.stepBusy = false;
          this.loadSteps(step.commissionId);
          this.reload();
        },
        error: () => {
          if (this.users.getUser()?.id !== account) return;
          this.stepBusy = false;
          this.stepError = 'Não foi possível excluir esta etapa.';
        }
      });
  }

  trackById(_: number, item: CreatorCommission): number {
    return item.id;
  }

  private emptyForm(): CreatorCommissionInput {
    const now = new Date();
    const today = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0')
    ].join('-');
    return {
      title: '',
      clientName: '',
      description: '',
      privateNotes: '',
      requestedOn: today,
      dueOn: null,
      artTypeId: null,
      workflowId: null
    };
  }
}
