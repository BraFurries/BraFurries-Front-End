import { CommonModule } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { BehaviorSubject, of, Subject } from 'rxjs';
import { CreatorCommission, CreatorStudioAccess, CreatorStudioService } from '../../../core/services/creator-studio.service';
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
      page, pageSize, total: status === 'QUEUED' || status === null ? 1 : 0
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
      imports: [CommonModule, FormsModule, RouterModule.forRoot([])],
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
