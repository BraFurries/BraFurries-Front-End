import { Component, OnDestroy, OnInit } from '@angular/core';
import { Observable, Subject, forkJoin, takeUntil } from 'rxjs';
import {
  PlatformAccess,
  PlatformAccessService,
  PlatformApprovedPerson,
  PlatformEligiblePerson,
  PlatformPermissionCode,
  PlatformPermissionDefinition,
  PlatformTeamRole,
  PLATFORM_PERMISSIONS
} from '../../../core/services/platform-access.service';

/**
 * BraFurries-private commercial area, independent of Community navigation.
 * The API is the only authorization authority; UI checks are presentation only.
 */
@Component({
  selector: 'app-commerce-access',
  standalone: false,
  templateUrl: './commerce-access.component.html'
})
export class PlatformAccessComponent implements OnInit, OnDestroy {
  permissionDefinitions: PlatformPermissionDefinition[] = [];
  permissionGroups: { label: string; permissions: PlatformPermissionDefinition[] }[] = [];
  private applyPermissionCatalog(catalog: PlatformPermissionDefinition[]): void {
    this.permissionDefinitions = catalog;
    const groups = new Map<string, PlatformPermissionDefinition[]>();
    for (const permission of catalog) {
      const area = permission.area === 'COMMERCE' ? 'Gestão Comercial'
        : permission.area === 'PARTNERS' ? 'Parcerias' : permission.area;
      groups.set(area, [...(groups.get(area) ?? []), permission]);
    }
    this.permissionGroups = Array.from(groups, ([label, permissions]) => ({ label, permissions }));
  }
  /** Administrative tab only. The old commerce page remains a read-only access summary. */
  isPermissionsManagementPage = false;

  access: PlatformAccess | null = null;
  people: PlatformApprovedPerson[] = [];
  roles: PlatformTeamRole[] = [];
  candidates: PlatformEligiblePerson[] = [];

  loading = true;
  loadingOwnerData = false;
  searching = false;
  saving = false;
  searched = false;
  searchText = '';
  candidateUserId: number | null = null;
  selectedPersonId: number | null = null;
  selectedRoleId: number | null = null;
  errorMessage = '';
  successMessage = '';

  private readonly destroy$ = new Subject<void>();

  constructor(private readonly service: PlatformAccessService) {}

  ngOnInit(): void {
    this.service.myAccess().pipe(takeUntil(this.destroy$)).subscribe({
      next: access => {
        this.access = access;
        this.loading = false;
        if (access.owner && this.isPermissionsManagementPage) this.loadOwnerData();
      },
      error: () => {
        this.loading = false;
        this.errorMessage = 'Não foi possível verificar seu acesso à plataforma.';
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get selectedPerson(): PlatformApprovedPerson | undefined {
    return this.people.find(person => person.userId === this.selectedPersonId);
  }

  get selectedRole(): PlatformTeamRole | undefined {
    return this.roles.find(role => role.roleId === this.selectedRoleId);
  }

  searchPeople(): void {
    if (!this.access?.owner || this.searching) return;
    this.searching = true;
    this.searched = true;
    this.errorMessage = '';
    this.candidateUserId = null;
    this.service.eligiblePeople(this.searchText.trim()).pipe(takeUntil(this.destroy$)).subscribe({
      next: candidates => {
        this.candidates = candidates.filter(person =>
          !this.people.some(approved => approved.userId === person.userId)
        );
        this.searching = false;
      },
      error: () => {
        this.searching = false;
        this.candidates = [];
        this.errorMessage = 'Não foi possível pesquisar membros da BraFurries.';
      }
    });
  }

  approveSelected(): void {
    if (!this.access?.owner || this.candidateUserId == null) return;
    const userId = this.candidateUserId;
    this.mutate(this.service.approve(userId),
      'Pessoa aprovada. Configure suas permissões individuais e as do cargo.');
  }

  removePerson(person: PlatformApprovedPerson): void {
    if (!this.access?.owner) return;
    const confirmed = window.confirm(
      `Revogar o acesso administrativo de ${person.name}? Todas as permissões individuais serão removidas.`
    );
    if (confirmed) {
      this.mutate(this.service.revoke(person.userId),
        'Autorização removida. O acesso foi revogado na API.');
    }
  }

  changePersonPermission(person: PlatformApprovedPerson,
    permission: PlatformPermissionCode, granted: boolean): void {
    if (!this.access?.owner) return;
    this.mutate(this.service.personPermission(person.userId, permission, granted),
      'Permissão individual atualizada.');
  }

  changeRolePermission(role: PlatformTeamRole,
    permission: PlatformPermissionCode, granted: boolean): void {
    if (!this.access?.owner) return;
    this.mutate(this.service.rolePermission(role.roleId, permission, granted),
      'Permissão do cargo atualizada.');
  }

  private mutate(request: Observable<void>, success: string): void {
    if (this.saving) return;
    this.saving = true;
    this.errorMessage = '';
    this.successMessage = '';
    request.pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.saving = false;
        this.successMessage = success;
        this.loadOwnerData();
      },
      error: error => {
        this.saving = false;
        this.errorMessage = error?.error?.message ||
          'Não foi possível salvar essa autorização. Nenhuma mudança foi confirmada.';
        this.loadOwnerData();
      }
    });
  }

  private loadOwnerData(): void {
    if (!this.access?.owner) return;
    this.loadingOwnerData = true;
    forkJoin({
      people: this.service.approvedPeople(),
      roles: this.service.teamRoles(),
      catalog: this.service.permissionCatalog()
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: ({ people, roles, catalog }) => {
        this.applyPermissionCatalog(catalog);
        this.people = people;
        this.roles = roles;
        this.selectedPersonId = people.some(p => p.userId === this.selectedPersonId)
          ? this.selectedPersonId : people[0]?.userId ?? null;
        this.selectedRoleId = roles.some(r => r.roleId === this.selectedRoleId)
          ? this.selectedRoleId : roles[0]?.roleId ?? null;
        this.candidates = this.candidates.filter(p =>
          !people.some(approved => approved.userId === p.userId)
        );
        this.candidateUserId = null;
        this.loadingOwnerData = false;
      },
      error: () => {
        this.loadingOwnerData = false;
        this.errorMessage = 'Não foi possível carregar os acessos privados. Confira a configuração da API e o schema.';
      }
    });
  }
}
