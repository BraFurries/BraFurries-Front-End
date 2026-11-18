import { CommonModule } from '@angular/common';
import { CdkDrag, CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { BehaviorSubject, of, Subject } from 'rxjs';
import { CreatorCommission, CreatorCommissionStatus, CreatorStudioAccess, CreatorStudioService } from '../../../core/services/creator-studio.service';
import { UserService } from '../../../core/services/user.service';
import { User } from '../../../shared/models/user';
import { CreatorStudioComponent } from './creator-studio.component';

describe('CreatorStudioComponent', () => {
  let component: CreatorStudioComponent;
  let fixture: ComponentFixture<CreatorStudioComponent>;
  let studio: jasmine.SpyObj<CreatorStudioService>;
  let users: jasmine.SpyObj<UserService>;
  let user$: BehaviorSubject<User | null>;

  const user: User = {
    id: 41, name: 'Luna', email: 'luna@example.invalid',
    roles: [], permissions: [], profileImageUrl: null
  };

  const pro: CreatorStudioAccess = {
    allowed: true, tier: 'PRO', status: 'ACTIVE',
    sourceKind: 'PILOT', expiresAtUtc: null
  };

  const card: CreatorCommission = {
    id: 11, title: 'Ref Sheet', clientName: 'Theo', description: 'Pedido',
    privateNotes: 'Notas', requestedOn: '2026-11-12', dueOn: null,
    artTypeId: null, status: 'QUEUED',
    createdAtUtc: '2026-11-17T12:00:00',
    updatedAtUtc: '2026-11-17T12:00:00', completedAtUtc: null
  };

  beforeEach(async () => {
    user$ = new BehaviorSubject<User | null>(user);
    studio = jasmine.createSpyObj<CreatorStudioService>('CreatorStudioService',
      ['myAccess', 'commissions', 'create', 'update', 'changeStatus',
        'artTypes', 'workflows', 'stageDefinitions', 'commissionSteps',
        'addCommissionStep', 'updateCommissionStep', 'deleteCommissionStep',
        'copyWorkflowToCommission', 'retention', 'exportMyData']);
    studio.myAccess.and.returnValue(of(pro));
    studio.commissions.and.callFake((status, page, pageSize) => of({
      items: status === 'QUEUED' || status === null ? [card] : [],
      page: page ?? 1, pageSize: pageSize ?? 25,
      total: status === 'QUEUED' || status === null ? 1 : 0
    }));
    studio.create.and.returnValue(of(card));
    studio.update.and.returnValue(of(card));
    studio.changeStatus.and.returnValue(of({...card,status:'COMPLETED'}));
    studio.artTypes.and.returnValue(of([]));
    studio.workflows.and.returnValue(of([]));
    studio.stageDefinitions.and.returnValue(of([]));
    studio.commissionSteps.and.returnValue(of([]));
    studio.retention.and.returnValue(of({
      policy: '12_MONTHS_AFTER_LAST_COMPLETION',
      retentionMonths: 12, advanceNoticeDays: 30, finalNoticeDays: 7,
      automaticDeletionEnabled: false, commissions: []
    }));
    studio.exportMyData.and.returnValue(of(new Blob(['{}'],{type:'application/json'})));
    users = jasmine.createSpyObj<UserService>('UserService',
      ['getUser'], { user$: user$.asObservable() });
    users.getUser.and.callFake(() => user$.value);

    await TestBed.configureTestingModule({
      declarations: [CreatorStudioComponent],
      imports: [CommonModule, FormsModule, DragDropModule, RouterModule.forRoot([])],
      providers: [
        {provide: CreatorStudioService, useValue: studio},
        {provide: UserService, useValue: users}
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(CreatorStudioComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    user$.complete();
  });

  it('shows four production lanes at once, each with its own server-side total', () => {
    expect(component.canUsePro).toBeTrue();
    expect(component.viewMode).toBe('board');
    expect(studio.commissions).toHaveBeenCalledTimes(4);
    for (const state of component.boardStatuses) {
      expect(studio.commissions).toHaveBeenCalledWith(state, 1, 12);
    }
    expect(component.activeCount).toBe(1);
    expect(component.boardColumns.find(col => col.status === 'QUEUED')?.total).toBe(1);
    const html = fixture.nativeElement.textContent as string;
    expect(html).toContain('Quadro de filas');
    expect(html).toContain('Ref Sheet');
    expect(html).toContain('12/11/2026');
    expect(html).toContain('Aguardando retorno');
    expect(html).toContain('Em pausa');
  });

  function drop(commission: CreatorCommission, from: CreatorCommissionStatus,
    to: CreatorCommissionStatus): CdkDragDrop<CreatorCommissionStatus, CreatorCommissionStatus, CreatorCommission> {
    return {
      previousContainer: {data: from},
      container: {data: to},
      item: {data: commission}
    } as unknown as CdkDragDrop<CreatorCommissionStatus, CreatorCommissionStatus, CreatorCommission>;
  }

  it('allows dragging the board cards without a Mover para select', () => {
    const board = fixture.nativeElement.querySelector('[aria-label="Quadro de filas por situação"]') as HTMLElement;
    expect(board.querySelector('select')).toBeNull();
    expect(fixture.debugElement.queryAll(By.directive(CdkDrag)).length).toBe(1);
    expect(board.textContent).toContain('Arraste para cá para concluir');
  });

  it('moves a card immediately and reconciles with the explicit status endpoint', () => {
    const pending = new Subject<CreatorCommission>();
    studio.changeStatus.and.returnValue(pending.asObservable());
    component.dropCommission(drop(card, 'QUEUED', 'IN_PROGRESS'));
    fixture.detectChanges();

    expect(studio.changeStatus).toHaveBeenCalledOnceWith(11, 'IN_PROGRESS');
    expect(component.changingId).toBe(11);
    expect(component.boardColumns[0].total).toBe(0);
    expect(component.boardColumns[0].items.length).toBe(0);
    expect(component.boardColumns[1].items[0].status).toBe('IN_PROGRESS');
    expect(component.boardColumns[1].total).toBe(1);

    pending.next({...card, status:'IN_PROGRESS'});
    pending.complete();
    expect(component.changingId).toBeNull();
    expect(studio.commissions).toHaveBeenCalledTimes(8);
  });

  it('rolls back an unsuccessful move and keeps the server-owned status', () => {
    const pending = new Subject<CreatorCommission>();
    studio.changeStatus.and.returnValue(pending.asObservable());
    const original = component.boardColumns;
    component.dropCommission(drop(card,'QUEUED','WAITING'));
    pending.error(new Error('offline'));
    fixture.detectChanges();

    expect(component.boardColumns).toBe(original);
    expect(component.boardColumns[0].items[0].status).toBe('QUEUED');
    expect(component.changingId).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Ele voltou à fila anterior');
    expect(studio.commissions).toHaveBeenCalledTimes(4);
  });

  it('ignores same-lane drops, unknown cards and simultaneous moves', () => {
    component.dropCommission(drop(card,'QUEUED','QUEUED'));
    component.dropCommission(drop({...card,id:999},'QUEUED','WAITING'));
    expect(studio.changeStatus).not.toHaveBeenCalled();
    const pending = new Subject<CreatorCommission>();
    studio.changeStatus.and.returnValue(pending.asObservable());
    component.dropCommission(drop(card,'QUEUED','WAITING'));
    component.dropCommission(drop(card,'QUEUED','PAUSED'));
    expect(studio.changeStatus).toHaveBeenCalledTimes(1);
    pending.error(new Error('offline'));
  });

  it('moves between adjacent queues with keyboard arrows when the card has focus', () => {
    const pending = new Subject<CreatorCommission>();
    studio.changeStatus.and.returnValue(pending.asObservable());
    const target = {};
    const event = {target, currentTarget: target, key: 'ArrowRight',
      preventDefault: jasmine.createSpy('preventDefault')} as unknown as KeyboardEvent;
    component.moveBoardCardByKeyboard(event, card);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(studio.changeStatus).toHaveBeenCalledOnceWith(11,'IN_PROGRESS');
    expect(component.boardColumns[1].items[0].id).toBe(11);
    pending.error(new Error('offline'));
  });

  it('can conclude a card through the compact board drop zone', () => {
    const pending = new Subject<CreatorCommission>();
    studio.changeStatus.and.returnValue(pending.asObservable());
    component.dropCommission(drop(card, 'QUEUED', 'COMPLETED'));
    expect(studio.changeStatus).toHaveBeenCalledOnceWith(11,'COMPLETED');
    expect(component.activeCount).toBe(0);
    expect(component.boardColumns[0].items.length).toBe(0);
    pending.error(new Error('offline'));
    expect(component.boardColumns[0].items.length).toBe(1);
  });

  it('does not move a card after access to Pro has been revoked', () => {
    studio.myAccess.and.returnValue(of({allowed:false,tier:'PRO',status:'REVOKED',
      sourceKind:'PILOT',expiresAtUtc:null}));
    user$.next({...user,id:56});
    component.dropCommission(drop(card,'QUEUED','IN_PROGRESS'));
    expect(studio.changeStatus).not.toHaveBeenCalled();
  });

  it('opens the complete paginated list for a selected lane', () => {
    component.showStatusList('QUEUED');
    fixture.detectChanges();
    expect(component.viewMode).toBe('list');
    expect(component.selectedStatus).toBe('QUEUED');
    expect(studio.commissions).toHaveBeenCalledWith('QUEUED', 1, 25);
    expect(fixture.nativeElement.textContent).toContain('Editar pedido');
    component.setViewMode('board');
    fixture.detectChanges();
    expect(component.boardColumns[0].total).toBe(1);
  });

  it('opens a board lane through its actual button without recycling list form controls', () => {
    const button = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
      .find(item => item.textContent?.includes('Abrir lista desta fila'));
    expect(button).toBeDefined();
    button!.click();
    fixture.detectChanges();

    expect(component.viewMode).toBe('list');
    expect(component.selectedStatus).toBe('QUEUED');
    expect(component.loading).toBeFalse();
    expect(studio.commissions).toHaveBeenCalledWith('QUEUED', 1, 25);
    expect(fixture.nativeElement.textContent).not.toContain('Carregando suas commissions...');

    const groups = component.groupedCommissions;
    const cardElement = fixture.nativeElement.querySelector(
      'section[aria-label="Commissions da fila"] article');
    expect(groups.length).toBe(1);
    expect(cardElement).not.toBeNull();
    // Angular change detection may run frequently due to ngModel. Neither the
    // grouping objects nor their live DOM nodes should be recreated.
    for (let i = 0; i < 10; i++) {
      fixture.detectChanges();
      expect(component.groupedCommissions).toBe(groups);
      expect(fixture.nativeElement.querySelector(
        'section[aria-label="Commissions da fila"] article')).toBe(cardElement);
    }
    expect(studio.commissions).toHaveBeenCalledTimes(5);
  });

  it('exits the list loading state when its HTTP response arrives and only regroups on change', () => {
    const pending = new Subject<{items:CreatorCommission[],page:number,pageSize:number,total:number}>();
    studio.commissions.and.returnValue(pending.asObservable());

    component.showStatusList('QUEUED');
    fixture.detectChanges();
    expect(component.loading).toBeTrue();
    expect(fixture.nativeElement.textContent).toContain('Carregando suas commissions...');

    pending.next({items:[card],page:1,pageSize:25,total:1});
    fixture.detectChanges();
    expect(component.loading).toBeFalse();
    expect(component.total).toBe(1);
    const original = component.groupedCommissions;
    expect(component.groupedCommissions).toBe(original);

    component.groupBy = 'status';
    fixture.detectChanges();
    const regrouped = component.groupedCommissions;
    expect(regrouped).not.toBe(original);
    expect(regrouped[0].label).toBe('Na fila');
    expect(component.groupedCommissions).toBe(regrouped);

    component.commissions = [{...card,id:12,title:'Outro ícone'}];
    fixture.detectChanges();
    expect(component.groupedCommissions).not.toBe(regrouped);
    pending.complete();
  });

  it('hides commission details when entitlement is revoked or downgraded to Free', () => {
    studio.myAccess.and.returnValue(of({
      allowed: true, tier: 'FREE', status: 'ACTIVE',
      sourceKind: 'INVITE', expiresAtUtc: null
    }));
    user$.next({...user,id:42});
    fixture.detectChanges();
    expect(component.canUsePro).toBeFalse();
    expect(component.commissions.length).toBe(0);
    expect(fixture.nativeElement.textContent).not.toContain('Cliente: Theo');
    expect(fixture.nativeElement.textContent).toContain('modalidade Free');
    expect(studio.commissions).toHaveBeenCalledTimes(4);
  });

  it('never shows a previous account response after switching accounts', () => {
    const delayed = new Subject<CreatorStudioAccess>();
    studio.myAccess.and.returnValues(delayed.asObservable(),
      of({allowed:false,tier:null,status:'NOT_AUTHORIZED',sourceKind:null,expiresAtUtc:null}));
    user$.next({...user,id:43});
    user$.next({...user,id:44});
    delayed.next(pro);
    fixture.detectChanges();
    expect(component.canUsePro).toBeFalse();
    expect(component.commissions).toEqual([]);
  });

  it('creates a new card without attempting to assign an owner ID', () => {
    component.newCommission();
    component.form.title='Ícone';
    component.form.clientName='Theo';
    component.form.requestedOn='2026-11-11';
    component.save();
    expect(studio.create).toHaveBeenCalledWith(jasmine.objectContaining({
      title:'Ícone',clientName:'Theo',requestedOn:'2026-11-11'
    }));
    expect(component.formOpen).toBeFalse();
    expect(studio.commissions).toHaveBeenCalledTimes(8);
  });

  it('uses the explicit status endpoint to conclude instead of deleting', () => {
    component.changeStatus(card,'COMPLETED');
    expect(studio.changeStatus).toHaveBeenCalledWith(11,'COMPLETED');
    expect(studio.commissions).toHaveBeenCalledTimes(8);
  });

  it('does not leak queued data from a previous account while a board request is delayed', () => {
    const delayed = new Subject<{items:CreatorCommission[],page:number,pageSize:number,total:number}>();
    studio.commissions.and.returnValue(delayed.asObservable());
    component.setViewMode('list');
    component.setViewMode('board');
    studio.myAccess.and.returnValue(of({
      allowed:false,tier:null,status:'NOT_AUTHORIZED',sourceKind:null,expiresAtUtc:null
    }));
    user$.next({...user,id:92});
    delayed.next({items:[card],page:1,pageSize:12,total:1});
    fixture.detectChanges();
    expect(component.canUsePro).toBeFalse();
    expect(component.activeCount).toBe(0);
    expect(fixture.nativeElement.textContent).not.toContain('Cliente: Theo');
    delayed.complete();
  });

  it('groups different art types under the same shared production stage', () => {
    const sketch = { ...card, currentStageName: 'Sketch', currentStageDefinitionId: 4 };
    const other = { ...card, id:12, title:'Ícone', currentStageName:'Esboço',
      currentStageDefinitionId:4 };
    component.commissions=[sketch,other];
    component.groupBy='stage';
    expect(component.groupedCommissions.length).toBe(1);
    expect(component.groupedCommissions[0].items.length).toBe(2);
    component.groupBy='type';
    expect(component.groupedCommissions.length).toBe(1);
  });

  it('loads existing stages only for a Pro-authorized commission', () => {
    component.toggleSteps(card);
    expect(studio.commissionSteps).toHaveBeenCalledWith(11);
    expect(component.expandedCommissionId).toBe(11);
    component.toggleSteps(card);
    expect(component.expandedCommissionId).toBeNull();
  });

  it('shows 30/7-day notices while keeping automatic deletion disabled', () => {
    studio.retention.and.returnValue(of({
      policy:'12_MONTHS_AFTER_LAST_COMPLETION',
      retentionMonths:12, advanceNoticeDays:30, finalNoticeDays:7,
      automaticDeletionEnabled:false,
      commissions:[{
        id:101,title:'Encomenda concluída',
        completedAtUtc:'2025-11-20T10:00:00',
        expiresAtUtc:'2026-11-20T10:00:00',
        warning:'FINAL_7_DAYS'
      }]
    }));
    user$.next({...user,id:51});
    fixture.detectChanges();
    const html = fixture.nativeElement.textContent as string;
    expect(html).toContain('Encomenda concluída');
    expect(html).toContain('Até 7 dias');
    expect(html).toContain('exclusão automática está desativada');
  });

  it('shows data export even if a prior Pro holder no longer has access', () => {
    studio.myAccess.and.returnValue(of({
      allowed:false,tier:'PRO',status:'REVOKED',
      sourceKind:'PILOT',expiresAtUtc:null
    }));
    user$.next({...user,id:61});
    fixture.detectChanges();
    expect(component.canUsePro).toBeFalse();
    expect(fixture.nativeElement.textContent).toContain('Exportar meus dados');
    expect(fixture.nativeElement.textContent).not.toContain('Cliente: Theo');
    expect(studio.retention).toHaveBeenCalledTimes(2);
  });

  it('formats date-only fields without local timezone conversion', () => {
    expect(component.formatCivilDate('2026-01-01')).toBe('01/01/2026');
    expect(component.formatCivilDate('2026-11-20T10:00:00')).toBe('20/11/2026');
    expect(component.formatCivilDate(null)).toBe('');
  });
});
