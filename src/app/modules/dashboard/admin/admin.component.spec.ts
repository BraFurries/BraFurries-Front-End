import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterModule } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import { PlatformAccessService } from '../../../core/services/platform-access.service';
import { UserPermissionsService } from '../../../core/services/user-permissions.service';
import { UserService } from '../../../core/services/user.service';
import { AdminComponent } from './admin.component';

describe('AdminComponent area tabs', () => {
  let fixture: ComponentFixture<AdminComponent>;
  let users: BehaviorSubject<any>;
  let commerce: jasmine.SpyObj<PlatformAccessService>;
  let globalAdmin = false;

  beforeEach(async () => {
    globalAdmin = false;
    users = new BehaviorSubject<any>({ id: 19, name: 'Membro', roles: [], permissions: [] });
    commerce = jasmine.createSpyObj('PlatformAccessService', ['myAccess']);
    commerce.myAccess.and.returnValue(of({ enabled: true, owner: false, permissions: ['PARTNERS_MANAGE'] }));

    await TestBed.configureTestingModule({
      declarations: [AdminComponent],
      imports: [RouterModule.forRoot([])],
      providers: [
        { provide: PlatformAccessService, useValue: commerce },
        { provide: UserService, useValue: { user$: users.asObservable() } },
        { provide: UserPermissionsService, useValue: { isAdmin: () => globalAdmin } }
      ]
    }).compileComponents();
  });

  function mount(): AdminComponent {
    fixture = TestBed.createComponent(AdminComponent);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  afterEach(() => fixture?.destroy());

  it('only exposes Partners tab to a delegated partner manager', () => {
    const component = mount();
    expect(component.canManagePartners).toBeTrue();
    expect(component.isGlobalAdmin).toBeFalse();
    expect(fixture.nativeElement.querySelector('a[href="/parceiros"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('a[href="/usuarios"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('a[href="/permissoes"]')).toBeNull();
  });

  it('exposes Permissions to the owner without giving additional admin tabs', () => {
    commerce.myAccess.and.returnValue(of({ enabled: true, owner: true, permissions: [] }));
    const component = mount();
    expect(component.isPermissionsOwner).toBeTrue();
    expect(fixture.nativeElement.querySelector('a[href="/permissoes"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('a[href="/metricas"]')).toBeNull();
  });

  it('preserves global administrator navigation when commercial access is absent', () => {
    globalAdmin = true;
    commerce.myAccess.and.returnValue(of({ enabled: false, owner: false, permissions: [] }));
    const component = mount();
    expect(component.isGlobalAdmin).toBeTrue();
    expect(component.canManagePartners).toBeTrue();
    expect(fixture.nativeElement.querySelector('a[href="/usuarios"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('a[href="/parceiros"]')).toBeTruthy();
  });

  it('does not reveal restricted tabs when access lookup fails', () => {
    commerce.myAccess.and.returnValue(of({ enabled: false, owner: false, permissions: [] }));
    const component = mount();
    expect(component.canManagePartners).toBeFalse();
    expect(component.isPermissionsOwner).toBeFalse();
  });
});
