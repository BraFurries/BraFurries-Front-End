import { Component, ElementRef, NgZone, OnDestroy, OnInit, QueryList, ViewChild, ViewChildren } from '@angular/core';
import { CdkDragEnd, CdkDragMove, CdkDragStart } from '@angular/cdk/drag-drop';
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
import { CreatorStageBoardComponent } from './creator-stage-board.component';

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
  viewMode: 'board' | 'list' | 'process' | 'stages' = 'board';
  selectedWorkflowId: number | null = null;
  @ViewChild(CreatorStageBoardComponent) private stageBoard?: CreatorStageBoardComponent;
  groupBy: 'date' | 'type' | 'status' | 'stage' = 'date';
  readonly boardStatuses: CreatorCommissionStatus[] =
    ['QUEUED','IN_PROGRESS','WAITING','PAUSED'];
  readonly completedBoardStatus: CreatorCommissionStatus = 'COMPLETED';
  readonly boardPageSize = 12;
  readonly boardDragStartDelay = {touch: 200, mouse: 0};
  boardColumns: {status: CreatorCommissionStatus; items: CreatorCommission[]; total: number}[] =
    this.boardStatuses.map(status => ({status,items:[],total:0}));
  boardLoading = false;
  boardError = '';
  draggedBoardCardId: number | null = null;
  hoveredBoardStatus: CreatorCommissionStatus | null = null;
  boardGhostIndex: number | null = null;
  boardGhostHeight = 160;
  @ViewChildren('boardDropZone', {read: ElementRef})
  private boardDropZones!: QueryList<ElementRef<HTMLElement>>;
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
    private readonly users: UserService,
    private readonly zone: NgZone
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
        this.draggedBoardCardId = null;
        this.hoveredBoardStatus = null;
        this.boardGhostIndex = null;
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
        this.selectedWorkflowId = null;
        this.viewMode = 'board';
        this.loading = false;
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

  setViewMode(mode: 'board' | 'list' | 'process' | 'stages'): void {
    if (mode === this.viewMode || !this.canUsePro) return;
    this.viewMode = mode;
    this.listSequence++;
    this.boardSequence++;
    this.boardLoading = false;
    this.loading = false;
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
    if (this.viewMode === 'process' || this.viewMode === 'stages') {
      this.stageBoard?.reloadBoard();
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

  private loadBoard(showLoading = true): void {
    const seq = ++this.boardSequence;
    const account = this.users.getUser()?.id;
    this.boardError = '';
    if (showLoading) this.boardLoading = true;
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
        if (!showLoading) {
          this.errorMessage = 'Pedido atualizado, mas não foi possível recarregar o quadro. Atualize a página.';
          return;
        }
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

  /**
   * Keep each CDK list disconnected. This leaves a copy of the source card
   * in place while the pointer moves; target lanes show only a visual ghost.
   * The whole lane is a hit area, rather than the small list inside it.
   */
  boardDragStarted(event: CdkDragStart<CreatorCommission>, commission: CreatorCommission): void {
    if (!this.canUsePro || this.viewMode !== 'board' || this.changingId !== null) return;
    this.draggedBoardCardId = commission.id;
    this.hoveredBoardStatus = null;
    this.boardGhostIndex = null;
    const height = event.source.getPlaceholderElement().getBoundingClientRect().height;
    this.boardGhostHeight = Math.max(110, Math.ceil(height || 160));
  }

  /**
   * Show a fixed empty slot where the commission would be placed after the API
   * reloads the lane. Backend order: requested_on ASC, id ASC. Pointer
   * movement inside a lane must never change the slot.
   */
  boardInsertionIndex(commission: CreatorCommission, status: CreatorCommissionStatus): number | null {
    const column = this.boardColumns.find(item => item.status === status);
    if (!column) return null;
    const index = column.items.findIndex(item =>
      item.requestedOn > commission.requestedOn ||
      (item.requestedOn === commission.requestedOn && item.id > commission.id));
    const insertion = index >= 0 ? index : column.items.length;
    // A paginated board only shows the first 12 orders. Avoid displaying a
    // misleading placeholder if the true position is after the visible page.
    return insertion === column.items.length && column.total > column.items.length
      ? null : insertion;
  }

  boardDragMoved(event: CdkDragMove<CreatorCommission>): void {
    if (this.draggedBoardCardId === null || !this.canUsePro) return;
    const point = this.boardPointer(event.event);
    if (!point) return;
    const target = this.boardDropZoneAt(point.x, point.y);
    const nextStatus = target?.status === event.source.data.status ? null : target?.status ?? null;
    const nextIndex = nextStatus && nextStatus !== 'COMPLETED'
      ? this.boardInsertionIndex(event.source.data, nextStatus) : null;
    // CDK emits this for every pixel: update Angular only on a lane change.
    if (nextStatus !== this.hoveredBoardStatus || nextIndex !== this.boardGhostIndex) {
      this.zone.run(() => {
        this.hoveredBoardStatus = nextStatus;
        this.boardGhostIndex = nextIndex;
      });
    }
  }

  boardDragEnded(event: CdkDragEnd<CreatorCommission>, commission: CreatorCommission): void {
    if (this.draggedBoardCardId !== commission.id) return;
    const point = this.boardPointer(event.event);
    const status = point ? this.boardDropZoneAt(point.x, point.y)?.status ?? null : null;
    this.draggedBoardCardId = null;
    this.hoveredBoardStatus = null;
    this.boardGhostIndex = null;
    // A release inside the origin, outside the board or a cancelled drag is a no-op.
    if (status && status !== commission.status) this.moveBoardCommission(commission, status);
  }

  private boardPointer(event: MouseEvent | TouchEvent): {x: number; y: number} | null {
    if ('changedTouches' in event) {
      const touch = event.changedTouches[0] ?? event.touches[0];
      return touch ? {x: touch.clientX, y: touch.clientY} : null;
    }
    return {x: event.clientX, y: event.clientY};
  }

  private boardDropZoneAt(x: number, y: number): {status: CreatorCommissionStatus; rect: DOMRect} | null {
    for (const item of this.boardDropZones?.toArray() ?? []) {
      const element = item.nativeElement;
      const rect = element.getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        const status = element.dataset['boardDropStatus'] as CreatorCommissionStatus | undefined;
        return status && (this.boardStatuses.includes(status) || status === 'COMPLETED')
          ? {status, rect} : null;
      }
    }
    return null;
  }

  moveBoardCardByKeyboard(event: KeyboardEvent, commission: CreatorCommission): void {
    if (event.target !== event.currentTarget ||
        (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
    const index = this.boardStatuses.indexOf(commission.status);
    const destination = index + (event.key === 'ArrowRight' ? 1 : -1);
    if (destination < 0 || destination >= this.boardStatuses.length ||
        !this.canUsePro || this.changingId !== null || this.saving) return;
    event.preventDefault();
    this.moveBoardCommission(commission, this.boardStatuses[destination]);
  }

  private moveBoardCommission(commission: CreatorCommission, status: CreatorCommissionStatus): void {
    if (!this.canUsePro || this.viewMode !== 'board' || this.boardLoading ||
        this.saving || this.changingId !== null || commission.status === status ||
        (!this.boardStatuses.includes(status) && status !== 'COMPLETED')) return;
    const source = this.boardColumns.find(column => column.status === commission.status);
    if (!source?.items.some(item => item.id === commission.id)) return;

    const account = this.users.getUser()?.id;
    const accessSequence = this.accessSequence;
    this.changingId = commission.id;
    this.boardSequence++; // Invalidate older background refreshes.
    this.errorMessage = '';
    // Never move the card in the local board before the API confirms the change.
    this.creatorStudio.changeStatus(commission.id, status)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          if (accessSequence !== this.accessSequence ||
              this.users.getUser()?.id !== account || !this.canUsePro) return;
          this.changingId = null;
          // Refresh silently to reconcile paginated columns without flickering.
          if (this.viewMode === 'board') this.loadBoard(false);
          else this.reload();
        },
        error: (error: HttpErrorResponse) => {
          if (accessSequence !== this.accessSequence ||
              this.users.getUser()?.id !== account || !this.canUsePro) return;
          this.changingId = null;
          this.errorMessage = error.status === 403
            ? 'Seu acesso ao Pro não está mais ativo. Recarregue a página.'
            : 'Não foi possível mover o pedido. Ele continua na fila anterior.';
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
