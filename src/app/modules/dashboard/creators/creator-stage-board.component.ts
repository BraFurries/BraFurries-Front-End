import { CdkDragEnd, CdkDragMove, CdkDragStart } from '@angular/cdk/drag-drop';
import { Component, ElementRef, EventEmitter, Input, NgZone, OnDestroy, OnInit, Output, QueryList, ViewChildren } from '@angular/core';
import { BehaviorSubject, combineLatest, distinctUntilChanged, forkJoin, Subject, takeUntil } from 'rxjs';
import {
  CreatorCommission, CreatorCommissionStep,
  CreatorStudioService, CreatorWorkflow, CreatorWorkflowStep,
  CreatorStageDefinition
} from '../../../core/services/creator-studio.service';
import { UserService } from '../../../core/services/user.service';

interface StageLane {
  key: string;
  name: string;
  stageDefinitionId: number | null;
  workflowStep: CreatorWorkflowStep | null;
  movable: boolean;
  items: CreatorCommission[];
  total: number;
}

/**
 * Two artist-owned projections over existing commissions:
 * - process: the workflow the order ACTUALLY copied at creation;
 * - shared: all current stages linked by canonical artist stage ID.
 *
 * This view never redefines workflow templates, owns no status rules and
 * doesn't infer legacy commission origins from today's art-type settings.
 */
@Component({
  selector: 'app-creator-stage-board',
  standalone: false,
  templateUrl: './creator-stage-board.component.html'
})
export class CreatorStageBoardComponent implements OnInit, OnDestroy {
  @ViewChildren('boardDropZone', {read: ElementRef})
  private boardDropZones!: QueryList<ElementRef<HTMLElement>>;
  @ViewChildren('orderDropZone', {read: ElementRef})
  private orderDropZones!: QueryList<ElementRef<HTMLElement>>;

  private readonly workflowSelection$ = new BehaviorSubject<number | null>(null);
  @Input() set workflowId(value: number | null) { this.workflowSelection$.next(value); }
  mode: 'process' | 'shared' = 'shared';
  workflow: CreatorWorkflow | null = null;
  columns: StageLane[] = [];
  @Output() readonly orderAvailableChange = new EventEmitter<boolean>(true);
  @Output() readonly orderEditingChange = new EventEmitter<boolean>();
  @Output() readonly moveInProgressChange = new EventEmitter<boolean>();
  orderDraft: CreatorStageDefinition[] | null = null;
  orderDragId: number | null = null;
  orderTargetIndex: number | null = null;
  orderSourceIndex: number | null = null;
  private sharedDefinitions: CreatorStageDefinition[] = [];
  private sharedCatalogReady = false;
  allowed = false;
  loading = true;
  loadingBoard = false;
  loadingMore = false;
  loadingLaneKey: string | null = null;
  private readonly lanePages = new Map<string, number>();
  error = '';
  private movingId: number | null = null;
  get busyId(): number | null { return this.movingId; }
  private set busyId(value: number | null) {
    const wasMoving = this.movingId !== null;
    this.movingId = value;
    if (wasMoving !== (value !== null)) this.moveInProgressChange.emit(value !== null);
  }
  processPage = 0;
  processTotal = 0;
  private processItems: CreatorCommission[] = [];
  draggedId: number | null = null;
  hoveredKey: string | null = null;
  ghostIndex: number | null = null;
  ghostHeight = 155;
  readonly dragDelay = {mouse: 0, touch: 200};
  private accountSequence = 0;
  private dataSequence = 0;
  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly studio: CreatorStudioService,
    private readonly users: UserService,
    private readonly zone: NgZone
  ) {}

  ngOnInit(): void {
    combineLatest([this.users.user$, this.workflowSelection$])
      .pipe(
        distinctUntilChanged((previous, next) =>
          previous[0]?.id === next[0]?.id &&
          previous[1] === next[1]),
        takeUntil(this.destroy$)
      ).subscribe(([user, requested]) => {
        const sequence = ++this.accountSequence;
        this.dataSequence++;
        this.workflow = null;
        this.columns = [];
        this.cancelStageOrder();
        this.sharedDefinitions = [];
        this.sharedCatalogReady = false;
        this.processItems = [];
        this.processPage = 0;
        this.processTotal = 0;
        this.loadingMore = false;
        this.allowed = false;
        this.loading = !!user;
        this.loadingBoard = false;
        this.loadingLaneKey = null;
        this.lanePages.clear();
        this.busyId = null;
        this.draggedId = null;
        this.hoveredKey = null;
        this.ghostIndex = null;
        this.orderAvailableChange.emit(false);
        this.error = user ? '' : 'Entre na sua conta para acessar o Creator Studio.';
        if (!user) return;
        if (requested !== null && (!Number.isSafeInteger(requested) || requested <= 0)) {
          this.loading = false;
          this.error = 'Processo inválido.';
          return;
        }
        this.mode = requested === null ? 'shared' : 'process';
        this.studio.myAccess().pipe(takeUntil(this.destroy$)).subscribe({
          next: access => {
            if (sequence !== this.accountSequence ||
                this.users.getUser()?.id !== user.id) return;
            this.loading = false;
            this.allowed = access.allowed && access.tier === 'PRO';
            if (!this.allowed) {
              this.error = 'Esta área é exclusiva das contas Pro autorizadas.';
              return;
            }
            forkJoin({
              workflows: this.studio.workflows(),
              definitions: this.studio.stageDefinitions()
            }).pipe(takeUntil(this.destroy$)).subscribe({
              next: result => {
                if (sequence !== this.accountSequence ||
                    this.users.getUser()?.id !== user.id) return;
                if (requested !== null) {
                  this.workflow = result.workflows.find(model => model.id === requested) ?? null;
                  if (!this.workflow) {
                    this.error = 'Processo não encontrado no seu ateliê.';
                    return;
                  }
                  this.columns = this.workflow.steps.map(step => ({
                    key: 'position:' + step.position,
                    name: step.name,
                    stageDefinitionId: step.stageDefinitionId,
                    workflowStep: step,
                    movable: true,
                    items: [], total: 0
                  }));
                  this.columns.push({
                    key: 'other', name: 'Etapas personalizadas / finalizadas',
                    stageDefinitionId: null, workflowStep: null,
                    movable: false, items: [], total: 0
                  });
                } else {
                  this.sharedDefinitions = this.restoreOrder(result.definitions, user.id);
                  this.sharedCatalogReady = true;
                  this.buildSharedLanes();
                }
                this.reloadBoard();
              },
              error: () => {
                if (sequence !== this.accountSequence ||
                    this.users.getUser()?.id !== user.id) return;
                this.error = 'Não foi possível carregar os processos e etapas.';
              }
            });
          },
          error: () => {
            if (sequence === this.accountSequence &&
                this.users.getUser()?.id === user.id) {
              this.loading = false;
              this.error = 'Não foi possível verificar seu acesso.';
            }
          }
        });
      });
  }

  private sharedLane(stage: CreatorStageDefinition): StageLane {
    return {
      key: 'shared:' + stage.id,
      name: stage.name, stageDefinitionId: stage.id,
      workflowStep: null, movable: false, items: [], total: 0
    };
  }

  private buildSharedLanes(): void {
    this.columns = this.sharedDefinitions.map(definition => this.sharedLane(definition));
    this.columns.push({
      key: 'unlinked', name: 'Sem etapa reutilizável',
      stageDefinitionId: null, workflowStep: null,
      movable: false, items: [], total: 0
    });
  }

  private orderKey(account: number): string {
    return 'brf.creator-studio.shared-stage-order.v1.' + account;
  }

  private restoreOrder(definitions: CreatorStageDefinition[], account: number): CreatorStageDefinition[] {
    try {
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem(this.orderKey(account)) : null;
      const saved: unknown = raw === null ? null : JSON.parse(raw);
      if (!Array.isArray(saved)) return definitions.slice();
      const byId = new Map(definitions.map(definition => [definition.id, definition]));
      const result: CreatorStageDefinition[] = [];
      for (const id of saved) {
        if (typeof id !== 'number') continue;
        const definition = byId.get(id);
        if (!definition) continue;
        result.push(definition);
        byId.delete(id);
      }
      return [...result, ...byId.values()];
    } catch {
      return definitions.slice();
    }
  }

  get canOrganizeStages(): boolean {
    return this.mode === 'shared' && this.allowed && this.sharedCatalogReady &&
      !this.loadingBoard && this.loadingLaneKey === null && this.sharedDefinitions.length > 1;
  }

  openStageOrder(): void {
    if (!this.canOrganizeStages || this.orderDraft) return;
    this.orderDraft = [...this.sharedDefinitions];
    this.orderEditingChange.emit(true);
  }

  trackDefinition(_index: number, definition: CreatorStageDefinition): number {
    return definition.id;
  }

  orderLaneTotal(id: number): number {
    return this.columns.find(lane => lane.stageDefinitionId === id)?.total ?? 0;
  }

  private clearOrderDrag(): void {
    this.orderDragId = null;
    this.orderSourceIndex = null;
    this.orderTargetIndex = null;
  }

  orderDragStarted(definition: CreatorStageDefinition): void {
    if (!this.orderDraft || !this.canOrganizeStages) return;
    const index = this.orderDraft.findIndex(item => item.id === definition.id);
    if (index < 0) return;
    this.clearOrderDrag();
    this.orderDragId = definition.id;
    this.orderSourceIndex = index;
  }

  private orderTargetAt(event: MouseEvent | TouchEvent): number | null {
    const point = this.pointer(event);
    if (!point || !this.orderDraft) return null;
    for (const item of this.orderDropZones?.toArray() ?? []) {
      const element = item.nativeElement;
      // Clipped columns outside the visible scroll area aren't valid targets.
      const viewport = element.parentElement?.getBoundingClientRect();
      if (viewport && (point.x < viewport.left || point.x > viewport.right ||
          point.y < viewport.top || point.y > viewport.bottom)) continue;
      const rect = element.getBoundingClientRect();
      if (point.x < rect.left || point.x > rect.right ||
          point.y < rect.top || point.y > rect.bottom) continue;
      const id = Number(element.dataset['orderStageId']);
      const index = this.orderDraft.findIndex(definition => definition.id === id);
      return index >= 0 && index !== this.orderSourceIndex ? index : null;
    }
    return null;
  }

  orderDragMoved(event: CdkDragMove<CreatorStageDefinition>): void {
    if (this.orderDragId !== event.source.data.id) return;
    const target = this.orderTargetAt(event.event);
    if (target !== this.orderTargetIndex) {
      this.zone.run(() => this.orderTargetIndex = target);
    }
  }

  orderDragEnded(event: CdkDragEnd<CreatorStageDefinition>, definition: CreatorStageDefinition): void {
    if (this.orderDragId !== definition.id) return;
    const target = this.orderTargetAt(event.event);
    const source = this.orderSourceIndex;
    this.zone.run(() => {
      this.clearOrderDrag();
      if (source !== null && target !== null && this.orderDraft?.[source]?.id === definition.id) {
        this.moveStageOrder(source, target - source);
      }
    });
  }

  moveStageOrderByKeyboard(event: KeyboardEvent, index: number): void {
    if (event.target !== event.currentTarget || this.orderDragId !== null ||
        (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
    event.preventDefault();
    this.moveStageOrder(index, event.key === 'ArrowLeft' ? -1 : 1);
  }

  moveStageOrder(index: number, offset: number): void {
    if (!this.orderDraft || !this.canOrganizeStages || this.orderDragId !== null) return;
    const next = index + offset;
    if (index < 0 || index >= this.orderDraft.length || next < 0 || next >= this.orderDraft.length) return;
    const [definition] = this.orderDraft.splice(index, 1);
    this.orderDraft.splice(next, 0, definition);
  }

  cancelStageOrder(): void {
    this.clearOrderDrag();
    if (!this.orderDraft) return;
    this.orderDraft = null;
    this.orderEditingChange.emit(false);
  }

  saveStageOrder(): void {
    const account = this.users.getUser()?.id;
    if (!this.orderDraft || !this.canOrganizeStages || account == null || this.orderDragId !== null) return;
    this.sharedDefinitions = this.orderDraft.slice();
    this.cancelStageOrder();
    // Reorder already loaded lanes by ID. Never move or refetch orders for a
    // presentation-only change; retain each lane's pages and totals.
    const byKey = new Map(this.columns.map(lane => [lane.key, lane]));
    this.columns = [...this.sharedDefinitions.map(definition => byKey.get('shared:' + definition.id)!),
      byKey.get('unlinked')!].filter(lane => !!lane);
    try {
      if (typeof window !== 'undefined') window.localStorage.setItem(this.orderKey(account),
        JSON.stringify(this.sharedDefinitions.map(definition => definition.id)));
    } catch {
      // The current view still uses the saved order when storage is unavailable.
    }
  }

  ngOnDestroy(): void {
    this.dataSequence++;
    this.destroy$.next();
    this.destroy$.complete();
    this.workflowSelection$.complete();
  }

  get visibleCount(): number { return this.processItems.length; }

  get canLoadMore(): boolean {
    return this.mode === 'process' && this.busyId === null && !this.loadingMore && !this.loadingBoard &&
      this.processItems.length < this.processTotal;
  }

  reloadBoard(): void {
    if (!this.allowed || !this.columns.length) return;
    this.error = '';
    this.loadingBoard = true;
    this.orderAvailableChange.emit(false);
    const seq = ++this.dataSequence;
    const account = this.users.getUser()?.id;
    if (this.mode === 'process') {
      this.processPage = 0;
      this.processItems = [];
      this.loadProcessPage(seq, account, 1);
      return;
    }
    const requestedLanes = this.columns.slice();
    const queries = requestedLanes.map(lane =>
      this.studio.commissionsForBoard(
        lane.key === 'unlinked' ? {unlinked: true} :
          {stageDefinitionId: lane.stageDefinitionId!}, 1, 12));
    forkJoin(queries).pipe(takeUntil(this.destroy$)).subscribe({
      next: pages => {
        if (!this.stillCurrent(seq, account)) return;
        const byKey = new Map(requestedLanes.map((lane, index) => [lane.key, pages[index]]));
        this.columns = this.columns.map(lane => {
          const page = byKey.get(lane.key);
          return page ? {...lane, items:page.items, total:page.total} : lane;
        });
        this.lanePages.clear();
        this.columns.forEach(lane => this.lanePages.set(lane.key, 1));
        this.loadingLaneKey = null;
        this.loadingBoard = false;
        this.busyId = null;
        this.orderAvailableChange.emit(this.canOrganizeStages);
      },
      error: () => this.failLoad(seq, account)
    });
  }

  canLoadMoreLane(lane: StageLane): boolean {
    return this.mode === 'shared' && !this.orderDraft && !this.loadingBoard &&
      this.loadingLaneKey === null && lane.items.length < lane.total;
  }

  loadMoreLane(lane: StageLane): void {
    if (!this.canLoadMoreLane(lane)) return;
    this.loadingLaneKey = lane.key;
    this.orderAvailableChange.emit(false);
    const seq = this.dataSequence;
    const account = this.users.getUser()?.id;
    const page = (this.lanePages.get(lane.key) ?? 1) + 1;
    this.studio.commissionsForBoard(
      lane.key === 'unlinked' ? {unlinked:true} :
        {stageDefinitionId:lane.stageDefinitionId!}, page, 12)
      .pipe(takeUntil(this.destroy$)).subscribe({
        next: result => {
          if (!this.stillCurrent(seq, account)) return;
          this.columns = this.columns.map(current =>
            current.key === lane.key ? {
              ...current, items:[...current.items, ...result.items], total:result.total
            } : current);
          this.lanePages.set(lane.key, page);
          this.loadingLaneKey = null;
          this.orderAvailableChange.emit(this.canOrganizeStages);
        },
        error: () => {
          if (!this.stillCurrent(seq, account)) return;
          this.loadingLaneKey = null;
          this.orderAvailableChange.emit(this.canOrganizeStages);
          this.error = 'Não foi possível carregar mais pedidos desta etapa.';
        }
      });
  }

  loadMore(): void {
    if (!this.canLoadMore) return;
    this.loadingMore = true;
    this.loadProcessPage(this.dataSequence, this.users.getUser()?.id, this.processPage + 1);
  }

  private loadProcessPage(seq: number, account: number | undefined, page: number): void {
    if (!this.workflow) return;
    this.studio.commissionsForBoard({workflowId:this.workflow.id}, page, 100)
      .pipe(takeUntil(this.destroy$)).subscribe({
        next: response => {
          if (!this.stillCurrent(seq, account)) return;
          this.processItems = page === 1 ? response.items : [...this.processItems, ...response.items];
          this.processPage = page;
          this.processTotal = response.total;
          this.rebuildProcessLanes();
          this.loadingBoard = false;
          this.loadingMore = false;
          this.busyId = null;
        },
        error: () => this.failLoad(seq, account)
      });
  }

  private stillCurrent(seq: number, account: number | undefined): boolean {
    return seq === this.dataSequence && this.allowed &&
      this.users.getUser()?.id === account;
  }

  private failLoad(seq: number, account: number | undefined): void {
    if (!this.stillCurrent(seq, account)) return;
    this.loadingBoard = false;
    this.loadingMore = false;
    this.loadingLaneKey = null;
    this.busyId = null;
    this.orderAvailableChange.emit(this.canOrganizeStages);
    this.error = 'Não foi possível carregar este quadro. Tente novamente.';
  }

  private rebuildProcessLanes(): void {
    const buckets = new Map<string, CreatorCommission[]>();
    for (const lane of this.columns) buckets.set(lane.key, []);
    for (const card of this.processItems) {
      const key = this.processStageKey(card);
      buckets.get(key)?.push(card);
    }
    this.columns = this.columns.map(lane => ({
      ...lane,
      items: buckets.get(lane.key) ?? [],
      total: buckets.get(lane.key)?.length ?? 0
    }));
  }

  private processStageKey(card: CreatorCommission): string {
    if (!this.workflow || !card.currentStageName) return 'other';
    const steps = this.workflow.steps;
    if (card.currentStageDefinitionId != null) {
      const matching = steps.filter(step =>
        step.stageDefinitionId === card.currentStageDefinitionId);
      const found = matching.length === 1 ? matching[0]
        : matching.find(step => step.position === card.currentStagePosition);
      return found ? 'position:' + found.position : 'other';
    }
    const found = steps.find(step =>
      step.stageDefinitionId == null &&
      step.position === card.currentStagePosition &&
      step.name === card.currentStageName);
    return found ? 'position:' + found.position : 'other';
  }

  private pointer(event: MouseEvent | TouchEvent): {x: number; y: number} | null {
    if ('changedTouches' in event) {
      const touch = event.changedTouches[0] ?? event.touches[0];
      return touch ? {x: touch.clientX, y: touch.clientY} : null;
    }
    return {x:event.clientX, y:event.clientY};
  }

  private targetAt(x: number, y: number): StageLane | null {
    for (const zone of this.boardDropZones?.toArray() ?? []) {
      const rect = zone.nativeElement.getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        const key = zone.nativeElement.dataset['stageTarget'];
        return this.columns.find(column => column.key === key) ?? null;
      }
    }
    return null;
  }

  canMoveCard(card: CreatorCommission): boolean {
    return this.mode === 'process' && this.allowed && this.busyId === null &&
      !this.loadingBoard && !this.loadingMore && !!this.workflow &&
      card.sourceWorkflowId === this.workflow.id && card.status !== 'COMPLETED' &&
      this.processItems.some(item => item.id === card.id);
  }

  dragStart(event: CdkDragStart<CreatorCommission>, card: CreatorCommission): void {
    if (!this.canMoveCard(card)) return;
    this.draggedId = card.id;
    this.hoveredKey = null;
    this.ghostIndex = null;
    this.ghostHeight = Math.max(110,
      Math.ceil(event.source.getPlaceholderElement().getBoundingClientRect().height || 155));
  }

  dragMove(event: CdkDragMove<CreatorCommission>, sourceKey: string): void {
    if (this.mode !== 'process' || this.draggedId === null || this.busyId !== null) return;
    const point = this.pointer(event.event);
    const target = point ? this.targetAt(point.x, point.y) : null;
    const key = target?.movable && target.key !== sourceKey ? target.key : null;
    const index = key && target ? this.insertionIndex(target, event.source.data) : null;
    if (this.hoveredKey !== key || this.ghostIndex !== index) {
      this.zone.run(() => { this.hoveredKey = key; this.ghostIndex = index; });
    }
  }

  insertionIndex(lane: StageLane, card: CreatorCommission): number | null {
    const index = lane.items.findIndex(item =>
      item.requestedOn > card.requestedOn ||
      (item.requestedOn === card.requestedOn && item.id > card.id));
    const result = index >= 0 ? index : lane.items.length;
    const incomplete = this.mode === 'process' &&
      this.processItems.length < this.processTotal;
    return result === lane.items.length &&
      (lane.total > lane.items.length || incomplete) ? null : result;
  }

  dragEnd(event: CdkDragEnd<CreatorCommission>, card: CreatorCommission,
          sourceKey: string): void {
    if (this.mode !== 'process' || this.draggedId !== card.id) return;
    const point = this.pointer(event.event);
    const lane = point ? this.targetAt(point.x, point.y) : null;
    this.zone.run(() => {
      this.draggedId = null;
      this.hoveredKey = null;
      this.ghostIndex = null;
      if (lane?.movable && lane.key !== sourceKey) this.moveToLane(card, lane);
    });
  }

  moveByKeyboard(event: KeyboardEvent, card: CreatorCommission, sourceKey: string): void {
    if (this.mode !== 'process' || event.target !== event.currentTarget ||
        (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
    const index = this.columns.findIndex(column => column.key === sourceKey);
    const destination = this.columns[index + (event.key === 'ArrowRight' ? 1 : -1)];
    if (!destination?.movable || !this.canMoveCard(card)) return;
    event.preventDefault();
    this.moveToLane(card, destination);
  }

  private moveToLane(card: CreatorCommission, lane: StageLane): void {
    if (!this.canMoveCard(card) || !lane.movable) return;
    this.busyId = card.id;
    this.error = '';
    const account = this.users.getUser()?.id;
    const seq = this.dataSequence;
    // Resolve the target against the immutable, artist-owned step snapshot.
    this.studio.commissionSteps(card.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: steps => {
        if (!this.stillCurrent(seq, account)) return;
        const matches = this.matchActualSteps(lane, steps);
        if (matches.length !== 1) {
          this.busyId = null;
          this.error = 'Este pedido não possui uma etapa única correspondente ao destino. Abra o pedido para ajustar seu processo.';
          return;
        }
        this.studio.moveCommissionToStep(card.id, matches[0].id)
          .pipe(takeUntil(this.destroy$)).subscribe({
            next: () => {
              if (this.stillCurrent(seq, account)) this.reloadBoard();
            },
            error: () => {
              if (!this.stillCurrent(seq, account)) return;
              this.busyId = null;
              this.error = 'Não foi possível mover este pedido. Ele permanece na etapa anterior.';
            }
          });
      },
      error: () => {
        if (!this.stillCurrent(seq, account)) return;
        this.busyId = null;
        this.error = 'Não foi possível verificar as etapas deste pedido.';
      }
    });
  }

  private matchActualSteps(lane: StageLane, steps: CreatorCommissionStep[]):
    CreatorCommissionStep[] {
    if (lane.workflowStep) {
      const target = lane.workflowStep;
      if (target.stageDefinitionId != null) {
        const matching = steps.filter(step =>
          step.stageDefinitionId === target.stageDefinitionId);
        if (matching.length === 1) return matching;
        return matching.filter(step => step.position === target.position);
      }
      return steps.filter(step =>
        step.stageDefinitionId == null && step.name === target.name &&
        step.position === target.position);
    }
    return []; // Shared-stage columns are read-only.
  }

  trackLane(_index: number, lane: StageLane): string { return lane.key; }
  trackCard(_index: number, card: CreatorCommission): number { return card.id; }

  formatDate(date: string | null): string {
    if (!date) return '';
    const [year, month, day] = date.slice(0, 10).split('-');
    return year && month && day ? `${day}/${month}/${year}` : date;
  }
}
