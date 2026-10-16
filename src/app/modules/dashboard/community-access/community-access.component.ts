import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subject, forkJoin, takeUntil } from 'rxjs';

import { CommunityAccess } from '../../../core/services/community-access.service';
import {
  CommunityContextService,
  CommunityContextState
} from '../../../core/services/community-context.service';
import {
  CommunityCapabilityDefinition,
  CommunityCapabilityService,
  CommunityMemberSummary
} from '../../../core/services/community-capability.service';
import { CommunityTeamRole } from '../../../core/services/community-team-roles.service';

@Component({
  selector: 'app-community-access',
  standalone: false,
  templateUrl: './community-access.component.html'
})
export class CommunityAccessComponent implements OnInit, OnDestroy {

  catalog: CommunityCapabilityDefinition[] = [];
  members: CommunityMemberSummary[] = [];
  memberTotal = 0;
  roles: CommunityTeamRole[] = [];

  selectedMember?: CommunityMemberSummary;
  selectedRole?: CommunityTeamRole;
  directGrants = new Set<string>();
  roleGrants = new Set<string>();

  memberSearch = '';
  loadingTargets = false;
  loadingMemberGrants = false;
  loadingRoleGrants = false;
  errorMessage = '';
  savingKey = '';

  private readonly destroy$ = new Subject<void>();
  private activeCommunityId: number | null = null;

  constructor(
    private readonly communityContext: CommunityContextService,
    private readonly capabilities: CommunityCapabilityService
  ) {}

  get selectedCommunityId(): number | null {
    return this.communityContext.snapshot.activeCommunity?.communityId ?? null;
  }

  get selectedAccess(): CommunityAccess | null {
    return this.communityContext.snapshot.activeAccess;
  }

  ngOnInit(): void {
    this.communityContext.state$
      .pipe(takeUntil(this.destroy$))
      .subscribe(state => this.applyCommunityContext(state));
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private applyCommunityContext(state: CommunityContextState): void {
    const communityId = state.activeCommunity?.communityId ?? null;
    if (
      state.status !== 'ready'
      || communityId === null
      || !state.activeAccess
      || communityId === this.activeCommunityId
    ) return;

    this.activeCommunityId = communityId;
    this.selectedMember = undefined;
    this.selectedRole = undefined;
    this.directGrants.clear();
    this.roleGrants.clear();
    this.memberSearch = '';
    this.loadTargets();
  }

  loadTargets(): void {
    if (this.selectedCommunityId == null) return;

    const communityId = this.selectedCommunityId;
    this.loadingTargets = true;
    this.errorMessage = '';

    forkJoin({
      catalog: this.capabilities.catalog(communityId),
      members: this.capabilities.listMembers(communityId, 1, 100, this.memberSearch),
      roles: this.capabilities.listRoles(communityId)
    }).subscribe({
      next: ({ catalog, members, roles }) => {
        if (communityId !== this.selectedCommunityId) return;
        this.catalog = catalog.capabilities;
        this.members = members.items;
        this.memberTotal = members.pagination.totalElements;
        this.roles = roles;
        this.loadingTargets = false;
      },
      error: (error) => {
        if (communityId !== this.selectedCommunityId) return;
        this.loadingTargets = false;
        this.errorMessage = error?.error?.message || 'Não foi possível carregar os alvos de acesso da Community.';
      }
    });
  }

  searchMembers(): void {
    if (this.selectedCommunityId == null || this.savingKey) return;
    const communityId = this.selectedCommunityId;
    this.loadingTargets = true;
    this.capabilities.listMembers(communityId, 1, 100, this.memberSearch).subscribe({
      next: (response) => {
        if (communityId !== this.selectedCommunityId) return;
        this.members = response.items;
        this.memberTotal = response.pagination.totalElements;
        this.loadingTargets = false;
        if (this.selectedMember && !this.members.some((member) => member.userId === this.selectedMember?.userId)) {
          this.selectedMember = undefined;
          this.directGrants.clear();
        }
      },
      error: (error) => {
        if (communityId !== this.selectedCommunityId) return;
        this.loadingTargets = false;
        this.errorMessage = error?.error?.message || 'Não foi possível pesquisar os membros.';
      }
    });
  }

  selectMember(member: CommunityMemberSummary): void {
    if (this.selectedCommunityId == null || this.savingKey) return;
    const communityId = this.selectedCommunityId;
    this.selectedMember = member;
    this.directGrants.clear();
    this.loadingMemberGrants = true;

    this.capabilities.directGrants(communityId, member.userId).subscribe({
      next: (response) => {
        if (communityId !== this.selectedCommunityId || member.userId !== this.selectedMember?.userId) return;
        this.directGrants = new Set(response.capabilities);
        this.loadingMemberGrants = false;
      },
      error: (error) => {
        if (communityId !== this.selectedCommunityId || member.userId !== this.selectedMember?.userId) return;
        this.loadingMemberGrants = false;
        this.errorMessage = error?.error?.message || 'Não foi possível carregar os acessos diretos deste membro.';
      }
    });
  }

  selectRole(role: CommunityTeamRole): void {
    if (this.selectedCommunityId == null || this.savingKey) return;
    const communityId = this.selectedCommunityId;
    this.selectedRole = role;
    this.roleGrants.clear();
    this.loadingRoleGrants = true;

    this.capabilities.roleGrants(communityId, role.id).subscribe({
      next: (response) => {
        if (communityId !== this.selectedCommunityId || role.id !== this.selectedRole?.id) return;
        this.roleGrants = new Set(response.capabilities);
        this.loadingRoleGrants = false;
      },
      error: (error) => {
        if (communityId !== this.selectedCommunityId || role.id !== this.selectedRole?.id) return;
        this.loadingRoleGrants = false;
        this.errorMessage = error?.error?.message || 'Não foi possível carregar os acessos deste cargo.';
      }
    });
  }

  directDefinitions(): CommunityCapabilityDefinition[] {
    return this.catalog.filter((definition) =>
      definition.directGrantAllowed
      && (definition.code !== 'COMMUNITY_ADMIN' || this.selectedAccess?.canManageCommunityAdmins === true)
    );
  }

  roleDefinitions(): CommunityCapabilityDefinition[] {
    return this.catalog.filter((definition) => definition.roleGrantAllowed);
  }

  hasDirect(code: string): boolean {
    return this.directGrants.has(code);
  }

  hasRole(code: string): boolean {
    return this.roleGrants.has(code);
  }

  toggleDirect(definition: CommunityCapabilityDefinition): void {
    if (this.selectedCommunityId == null || !this.selectedMember || this.savingKey) return;
    if (!definition.directGrantAllowed) return;
    if (definition.code === 'COMMUNITY_ADMIN' && !this.selectedAccess?.canManageCommunityAdmins) return;

    const communityId = this.selectedCommunityId;
    const userId = this.selectedMember.userId;
    const currentlyGranted = this.directGrants.has(definition.code);
    this.savingKey = `user:${userId}:${definition.code}`;
    this.errorMessage = '';

    const request = currentlyGranted
      ? this.capabilities.revokeDirect(communityId, userId, definition.code)
      : this.capabilities.grantDirect(communityId, userId, definition.code);

    request.subscribe({
      next: (response) => {
        if (communityId === this.selectedCommunityId && userId === this.selectedMember?.userId) {
          this.directGrants = new Set(response.capabilities);
        }
        this.savingKey = '';
        this.communityContext.refreshActiveAccess().subscribe();
      },
      error: (error) => {
        this.savingKey = '';
        this.errorMessage = error?.error?.message || 'Não foi possível alterar a capability do membro.';
      }
    });
  }

  toggleRole(definition: CommunityCapabilityDefinition): void {
    if (this.selectedCommunityId == null || !this.selectedRole || this.savingKey) return;
    if (!definition.roleGrantAllowed) return;

    const communityId = this.selectedCommunityId;
    const roleId = this.selectedRole.id;
    const currentlyGranted = this.roleGrants.has(definition.code);
    this.savingKey = `role:${roleId}:${definition.code}`;
    this.errorMessage = '';

    const request = currentlyGranted
      ? this.capabilities.revokeRole(communityId, roleId, definition.code)
      : this.capabilities.grantRole(communityId, roleId, definition.code);

    request.subscribe({
      next: (response) => {
        if (communityId === this.selectedCommunityId && roleId === this.selectedRole?.id) {
          this.roleGrants = new Set(response.capabilities);
        }
        this.savingKey = '';
        this.communityContext.refreshActiveAccess().subscribe();
      },
      error: (error) => {
        this.savingKey = '';
        this.errorMessage = error?.error?.message || 'Não foi possível alterar a capability do cargo.';
      }
    });
  }

  capabilityLabel(code: string): string {
    const labels: Record<string, string> = {
      COMMUNITY_ADMIN: 'Administrador da Community',
      TEAM_ASSIGN_MEMBERS: 'Atribuir membros aos cargos abaixo',
      TEAM_MANAGE_STRUCTURE: 'Gerenciar cargos abaixo',
      TEAM_MANAGE_DEMANDS: 'Gerenciar demandas abaixo',
      MEMBERS_VIEW: 'Ver membros',
      MEMBER_DETAILS_VIEW: 'Ver detalhes e gerenciar membros',
      MEMBER_NOTES_VIEW: 'Ver notas internas',
      MEMBER_NOTES_MANAGE: 'Gerenciar notas internas'
    };
    return labels[code] ?? code;
  }

  capabilityHelp(definition: CommunityCapabilityDefinition): string {
    if (definition.code === 'COMMUNITY_ADMIN') {
      return 'Acesso operacional completo à Community. Somente o Owner pode adicionar ou remover outro administrador.';
    }
    if (definition.hierarchicalTeamScope) {
      return 'O poder vale somente para cargos estritamente abaixo deste cargo na hierarquia.';
    }
    if (definition.code === 'MEMBER_DETAILS_VIEW') {
      return 'Inclui a ficha detalhada e as ações de gestão do membro dentro desta Community.';
    }
    return '';
  }

  memberStatusLabel(member: CommunityMemberSummary): string {
    const labels: Record<CommunityMemberSummary['status'], string> = {
      active: 'Ativo',
      left: 'Ausente',
      banned: 'Banido',
      pending: 'Pendente',
      unknown: 'Indefinido',
      ambiguous: 'Dados ambíguos'
    };
    return labels[member.status];
  }
}
