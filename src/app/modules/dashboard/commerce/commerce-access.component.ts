import { Component, OnDestroy, OnInit } from '@angular/core';
import { Observable, Subject, forkJoin, takeUntil } from 'rxjs';
import {
  CommerceAccess,
  CommerceAccessService,
  CommerceApprovedPerson,
  CommerceEligiblePerson,
  CommercePermissionCode,
  CommerceTeamRole,
  COMMERCE_PERMISSIONS
} from '../../../core/services/commerce-access.service';

/**
 * BraFurries-private commercial area, independent of Community navigation.
 * The API is the only authorization authority; UI checks are presentation only.
 */
@Component({
  selector: 'app-commerce-access',
  standalone: false,
  templateUrl: './commerce-access.component.html'
})
export class CommerceAccessComponent implements OnInit, OnDestroy {
  readonly permissionDefinitions = COMMERCE_PERMISSIONS;

  access: CommerceAccess | null = null;
  people: CommerceApprovedPerson[] = [];
  roles: CommerceTeamRole[] = [];
  candidates: CommerceEligiblePerson[] = [];

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

  constructor(private readonly service: CommerceAccessService) {}

  ngOnInit(): void {
    this.service.myAccess().pipe(takeUntil(this.destroy$)).subscribe({
      next: access => {
        this.access = access;
        this.loading = false;
        if (access.owner) this.loadOwnerData();
      },
      error: () => {
        this.loading = false;
        this.errorMessage = 'Não foi possível verificar seu acesso à Gestão Comercial.';
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get selectedPerson(): CommerceApprovedPerson | undefined {
    return this.people.find(person => person.userId === this.selectedPersonId);
  }

  get selectedRole(): CommerceTeamRole | undefined {
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

  removePerson(person: CommerceApprovedPerson): void {
    if (!this.access?.owner) return;
    const confirmed = window.confirm(
      `Revogar o acesso comercial de ${person.name}? Todas as permissões individuais serão removidas.`
    );
    if (confirmed) {
      this.mutate(this.service.revoke(person.userId),
        'Autorização removida. O acesso foi revogado na API.');
    }
  }

  changePersonPermission(person: CommerceApprovedPerson,
    permission: CommercePermissionCode, granted: boolean): void {
    if (!this.access?.owner) return;
    this.mutate(this.service.personPermission(person.userId, permission, granted),
      'Permissão individual atualizada.');
  }

  changeRolePermission(role: CommerceTeamRole,
    permission: CommercePermissionCode, granted: boolean): void {
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
      roles: this.service.teamRoles()
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: ({ people, roles }) => {
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
