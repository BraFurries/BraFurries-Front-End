import { CommonModule } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
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
      ['myAccess', 'commissions', 'create', 'update', 'changeStatus']);
    studio.myAccess.and.returnValue(of(pro));
    studio.commissions.and.returnValue(of({items:[card],page:1,pageSize:25,total:1}));
    studio.create.and.returnValue(of(card));
    studio.update.and.returnValue(of(card));
    studio.changeStatus.and.returnValue(of({...card,status:'COMPLETED'}));
    users = jasmine.createSpyObj<UserService>('UserService',
      ['getUser'], { user$: user$.asObservable() });
    users.getUser.and.callFake(() => user$.value);

    await TestBed.configureTestingModule({
      declarations: [CreatorStudioComponent],
      imports: [CommonModule, FormsModule],
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

  it('shows the private Pro queue and the original civil order date', () => {
    expect(component.canUsePro).toBeTrue();
    expect(studio.commissions).toHaveBeenCalledWith(null, 1, 25);
    const html = fixture.nativeElement.textContent as string;
    expect(html).toContain('Ref Sheet');
    expect(html).toContain('12/11/2026');
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
    expect(studio.commissions).toHaveBeenCalledTimes(1);
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
    expect(studio.commissions).toHaveBeenCalledTimes(2);
  });

  it('uses the explicit status endpoint to conclude instead of deleting', () => {
    component.changeStatus(card,'COMPLETED');
    expect(studio.changeStatus).toHaveBeenCalledWith(11,'COMPLETED');
    expect(studio.commissions).toHaveBeenCalledTimes(2);
  });

  it('formats date-only fields without local timezone conversion', () => {
    expect(component.formatCivilDate('2026-01-01')).toBe('01/01/2026');
    expect(component.formatCivilDate(null)).toBe('');
  });
});
