import { CommonModule } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { of } from 'rxjs';
import {
  CommerceAccessService,
  CommerceApprovedPerson,
  CommerceTeamRole
} from '../../../core/services/commerce-access.service';
import { CommerceAccessComponent } from './commerce-access.component';

describe('CommerceAccessComponent', () => {
  let fixture: ComponentFixture<CommerceAccessComponent>;
  let component: CommerceAccessComponent;
  let service: jasmine.SpyObj<CommerceAccessService>;

  const person: CommerceApprovedPerson = {
    userId: 19, name: 'Artista autorizado', permissions: ['ARTWORKS_MANAGE']
  };
  const role: CommerceTeamRole = {
    roleId: 42, name: 'Gestor de loja', active: true, permissions: ['PRODUCTS_MANAGE']
  };

  async function init(owner: boolean, enabled = true, permissions: string[] = []): Promise<void> {
    service = jasmine.createSpyObj<CommerceAccessService>('CommerceAccessService', [
      'myAccess', 'approvedPeople', 'eligiblePeople', 'teamRoles',
      'approve', 'revoke', 'personPermission', 'rolePermission'
    ]);
    service.myAccess.and.returnValue(of({ enabled, owner, permissions }));
    service.approvedPeople.and.returnValue(of([person]));
    service.teamRoles.and.returnValue(of([role]));
    service.eligiblePeople.and.returnValue(of([{ userId: 22, name: 'Membro elegível' }]));
    service.approve.and.returnValue(of(void 0));
    service.revoke.and.returnValue(of(void 0));
    service.personPermission.and.returnValue(of(void 0));
    service.rolePermission.and.returnValue(of(void 0));

    await TestBed.configureTestingModule({
      declarations: [CommerceAccessComponent],
      imports: [CommonModule, FormsModule],
      providers: [{ provide: CommerceAccessService, useValue: service }]
    }).compileComponents();
    fixture = TestBed.createComponent(CommerceAccessComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  afterEach(() => {
    fixture?.destroy();
  });

  it('keeps owner-only controls hidden when the API did not authorize them', async () => {
    await init(false);
    expect(fixture.nativeElement.textContent).toContain('Sua conta não possui autorização');
    expect(fixture.nativeElement.textContent).not.toContain('Pessoas autorizadas');
    expect(service.approvedPeople).not.toHaveBeenCalled();
    expect(service.teamRoles).not.toHaveBeenCalled();
  });

  it('fails closed when the private module configuration is not enabled', async () => {
    await init(false, false);
    expect(fixture.nativeElement.textContent).toContain('O módulo comercial está desativado');
    expect(service.approvedPeople).not.toHaveBeenCalled();
  });

  it('shows approved people and role permissions to the configured owner', async () => {
    await init(true, true, ['PRODUCTS_MANAGE']);
    expect(fixture.nativeElement.textContent).toContain('Pessoas autorizadas');
    expect(fixture.nativeElement.textContent).toContain('Artista autorizado');
    expect(fixture.nativeElement.textContent).toContain('Gestor de loja');
    expect(service.approvedPeople).toHaveBeenCalledTimes(1);
    expect(service.teamRoles).toHaveBeenCalledTimes(1);
  });

  it('approves a searched BraFurries member through the private API', async () => {
    await init(true);
    component.searchText = 'elegível';
    component.searchPeople();
    component.candidateUserId = 22;
    component.approveSelected();

    expect(service.eligiblePeople).toHaveBeenCalledWith('elegível');
    expect(service.approve).toHaveBeenCalledWith(22);
    expect(component.successMessage).toContain('Pessoa aprovada');
  });

  it('grants a role permission without changing Community capabilities', async () => {
    await init(true);
    component.changeRolePermission(role, 'FINANCE_VIEW', true);

    expect(service.rolePermission).toHaveBeenCalledWith(42, 'FINANCE_VIEW', true);
    expect(component.successMessage).toBe('Permissão do cargo atualizada.');
  });

  it('does not mutate access when the API denies ownership', async () => {
    await init(false);
    component.changeRolePermission(role, 'PAYMENTS_RECORD', true);
    component.changePersonPermission(person, 'PAYMENTS_RECORD', true);
    component.candidateUserId = 22;
    component.approveSelected();

    expect(service.rolePermission).not.toHaveBeenCalled();
    expect(service.personPermission).not.toHaveBeenCalled();
    expect(service.approve).not.toHaveBeenCalled();
  });
});
