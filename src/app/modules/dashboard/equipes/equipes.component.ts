import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { CommunityAccess } from '../../../core/services/community-access.service';
import {
  CommunityContextService,
  CommunityContextState
} from '../../../core/services/community-context.service';
import { CommunityTeamRole, CommunityTeamRoleDeletionImpact, CommunityTeamRolesService, SaveCommunityTeamRoleRequest } from '../../../core/services/community-team-roles.service';
import { CommunityTeamDemand, CommunityTeamDemandsService, SaveCommunityTeamDemandRequest } from '../../../core/services/community-team-demands.service';
import { CommunityTeamAssignmentsService, TeamMemberRef } from '../../../core/services/community-team-assignments.service';
import { buildTeamOrgChart, flattenTeamOrgChart } from './team-org-chart/team-org-chart.component';

type AssignmentFilter = 'all' | 'assigned' | 'unassigned';
type TeamViewMode = 'mine' | 'all';

@Component({
  selector: 'app-equipes',
  standalone: false,
  templateUrl: './equipes.component.html'
})
export class EquipesComponent implements OnInit, OnDestroy {
  roles: CommunityTeamRole[] = [];
  filteredRoleList: CommunityTeamRole[] = [];
  filteredOrgChartRoles: CommunityTeamRole[] = [];
  visibleDemandRoles: CommunityTeamRole[] = [];
  demands: CommunityTeamDemand[] = [];
  visibleDemands: CommunityTeamDemand[] = [];
  roleMembers: Record<number, TeamMemberRef[]> = {};
  roleMemberStates: Record<number, 'loading' | 'loaded' | 'error'> = {};
  showOrgMembers = false;
  managingMembersRole?: CommunityTeamRole;
  assignedMembers: TeamMemberRef[] = [];
  memberCandidates: TeamMemberRef[] = [];
  memberSearchTerm = '';
  memberCandidateTotal = 0;
  memberAssignmentsLoading = false;
  memberSearchLoading = false;
  memberSavingUserId?: number;
  memberError = '';
  visibleRoles: { role: CommunityTeamRole; depth: number }[] = [];
  teamViewMode: TeamViewMode = 'all';
  loadingRoles = false;
  loadingDemands = false;
  errorMessage = '';
  formErrorMessage = '';
  showInactive = false;
  roleSearchTerm = '';
  demandSearchTerm = '';
  demandAssignmentFilter: AssignmentFilter = 'all';
  roleDemandFilter: AssignmentFilter = 'all';
  structureFiltersOpen = false;
  demandFiltersOpen = false;
  editingRole?: CommunityTeamRole;
  formOpen = false;
  saving = false;
  activeTab: 'structure' | 'demands' = 'structure';
  structureView: 'list' | 'chart' = 'list';
  demandView: 'demand' | 'role' = 'demand';
  editingDemand?: CommunityTeamDemand;
  demandFormOpen = false;
  demandSaving = false;
  demandFormErrorMessage = '';
  demandDraft: SaveCommunityTeamDemandRequest = { name: '', description: null, roleIds: [] };
  deletingRole?: CommunityTeamRole;
  deletionImpact?: CommunityTeamRoleDeletionImpact;
  deletionLoading = false;
  deletionError = '';
  deletingDemand?: CommunityTeamDemand;
  demandDeleteError = '';
  private readonly destroy$ = new Subject<void>();
  private activeCommunityId: number | null = null;
  private activeAccessSignature = '';
  private demandLoadGeneration = 0;
  private roleLoadGeneration = 0;
  private memberSearchGeneration = 0;
  private roleMemberLoadGenerations: Record<number, number> = {};
  draft: SaveCommunityTeamRoleRequest = { name: '', description: null, parentRoleId: null };

  constructor(
    private readonly communityContext: CommunityContextService,
    private readonly teamRoles: CommunityTeamRolesService,
    private readonly teamDemands: CommunityTeamDemandsService,
    private readonly teamAssignments: CommunityTeamAssignmentsService
  ) { }

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
    if (state.status !== 'ready' || communityId === null || !state.activeAccess) return;

    const accessSignature = JSON.stringify({
      owner: state.activeAccess.owner,
      communityAdmin: state.activeAccess.communityAdmin,
      activeRoleIds: [...state.activeAccess.activeRoleIds].sort((a, b) => a - b),
      capabilities: [...state.activeAccess.capabilities].sort(),
      teamScopes: state.activeAccess.teamScopes
    });
    const changedCommunity = communityId !== this.activeCommunityId;
    const changedAccess = accessSignature !== this.activeAccessSignature;

    if (!changedCommunity && !changedAccess) return;
    if (this.saving || this.demandSaving || this.deletionLoading || this.memberSavingUserId !== undefined) return;

    this.activeCommunityId = communityId;
    this.activeAccessSignature = accessSignature;
    this.teamViewMode = state.activeAccess.activeRoleIds.length > 0 ? 'mine' : 'all';

    if (!changedCommunity) {
      this.refreshRoleViews();
      this.rebuildDemandViews();
      return;
    }

    this.roles = [];
    this.filteredRoleList = [];
    this.filteredOrgChartRoles = [];
    this.visibleDemandRoles = [];
    this.demands = [];
    this.visibleDemands = [];
    this.visibleRoles = [];
    this.roleMembers = {};
    this.roleMemberStates = {};
    this.roleMemberLoadGenerations = {};
    this.showOrgMembers = false;
    this.managingMembersRole = undefined;
    this.assignedMembers = [];
    this.memberCandidates = [];
    this.memberSearchTerm = '';
    this.memberCandidateTotal = 0;
    this.memberAssignmentsLoading = false;
    this.memberSearchLoading = false;
    this.memberSavingUserId = undefined;
    this.memberError = '';
    this.memberSearchGeneration++;
    this.formOpen = false;
    this.demandFormOpen = false;
    this.deletingRole = undefined;
    this.deletingDemand = undefined;
    this.demandDeleteError = '';
    this.roleSearchTerm = '';
    this.demandSearchTerm = '';
    this.showInactive = false;
    this.demandAssignmentFilter = 'all';
    this.roleDemandFilter = 'all';
    this.structureFiltersOpen = false;
    this.demandFiltersOpen = false;
    this.loadRoles();
    this.loadDemands();
  }

  loadDemands(): void {
    if (this.selectedCommunityId == null) return;
    const communityId = this.selectedCommunityId;
    const generation = ++this.demandLoadGeneration;
    this.loadingDemands = true;
    this.teamDemands.listCommunity(communityId).subscribe({
      next: demands => {
        if (communityId !== this.selectedCommunityId || generation !== this.demandLoadGeneration) return;
        this.demands = demands;
        this.rebuildDemandViews();
        this.loadingDemands = false;
      },
      error: error => {
        if (communityId !== this.selectedCommunityId || generation !== this.demandLoadGeneration) return;
        this.loadingDemands = false;
        this.errorMessage = error?.error?.message || 'Não foi possível carregar as demandas.';
      }
    });
  }

  loadRoles(): void {
    if (this.selectedCommunityId == null) return;
    const communityId = this.selectedCommunityId;
    const generation = ++this.roleLoadGeneration;
    this.loadingRoles = true;
    this.errorMessage = '';
    this.teamRoles.listCommunity(communityId).subscribe({
      next: roles => {
        if (communityId !== this.selectedCommunityId || generation !== this.roleLoadGeneration) return;
        this.roles = roles; this.refreshRoleViews(); this.loadingRoles = false;
        if (this.showOrgMembers) roles.forEach(role => this.loadRoleMembers(role.id));
      },
      error: error => {
        if (communityId !== this.selectedCommunityId || generation !== this.roleLoadGeneration) return;
        this.loadingRoles = false; this.errorMessage = error?.error?.message || 'Não foi possível carregar os cargos.';
      }
    });
  }

  openCreate(): void {
    if (this.saving || !this.canCreateRole()) return;
    this.editingRole = undefined;
    const scope = this.teamScope('TEAM_MANAGE_STRUCTURE');
    this.draft = {
      name: '',
      description: null,
      parentRoleId: scope?.unrestricted ? null : (scope?.sourceRoleIds[0] ?? null)
    };
    this.formErrorMessage = '';
    this.formOpen = true;
  }

  openEdit(role: CommunityTeamRole): void {
    if (this.saving || !this.canManageStructureRole(role.id)) return;
    this.editingRole = role;
    this.draft = { name: role.name, description: role.description, parentRoleId: role.parentRoleId };
    this.formErrorMessage = '';
    this.formOpen = true;
  }

  closeForm(): void {
    if (this.saving) return;
    this.formOpen = false;
  }

  save(): void {
    if (this.selectedCommunityId == null || !this.draft.name.trim() || this.saving) return;
    this.saving = true;
    this.formErrorMessage = '';
    const request = { ...this.draft, name: this.draft.name.trim(), description: this.draft.description?.trim() || null };
    const response = this.editingRole
      ? this.teamRoles.updateCommunity(this.selectedCommunityId, this.editingRole.id, request)
      : this.teamRoles.createCommunity(this.selectedCommunityId, request);
    response.subscribe({
      next: () => { this.saving = false; this.formOpen = false; this.loadRoles(); },
      error: error => { this.saving = false; this.formErrorMessage = error?.error?.message || 'Não foi possível salvar o cargo.'; }
    });
  }

  setActive(role: CommunityTeamRole, active: boolean): void {
    if (this.selectedCommunityId == null || !this.canManageStructureRole(role.id)) return;
    this.teamRoles.setActiveCommunity(this.selectedCommunityId, role.id, active).subscribe({
      next: () => this.loadRoles(),
      error: error => this.errorMessage = error?.error?.message || 'Não foi possível atualizar o cargo.'
    });
  }

  openRoleDelete(role: CommunityTeamRole): void {
    if (this.saving || this.demandSaving || this.selectedCommunityId == null || !this.canManageStructureRole(role.id)) return;
    this.deletingRole = role; this.deletionImpact = undefined; this.deletionError = ''; this.deletionLoading = true;
    const communityId = this.selectedCommunityId;
    this.teamRoles.deletionImpactCommunity(communityId, role.id).subscribe({
      next: impact => { if (communityId === this.selectedCommunityId && this.deletingRole?.id === role.id) { this.deletionImpact = impact; this.deletionLoading = false; } },
      error: error => { if (communityId === this.selectedCommunityId) { this.deletionError = error?.error?.message || 'Não foi possível verificar a exclusão.'; this.deletionLoading = false; } }
    });
  }
  closeRoleDelete(): void { if (!this.deletionLoading) this.deletingRole = undefined; }
  confirmRoleDelete(): void {
    if (!this.deletingRole || !this.deletionImpact?.canDelete || this.deletionLoading || this.selectedCommunityId == null) return;
    const role = this.deletingRole; const communityId = this.selectedCommunityId; this.deletionLoading = true; this.deletionError = '';
    this.teamRoles.deleteCommunity(communityId, role.id).subscribe({
      next: () => { if (communityId === this.selectedCommunityId) { this.deletingRole = undefined; this.deletionLoading = false; this.loadRoles(); this.loadDemands(); } },
      error: error => { if (communityId === this.selectedCommunityId) { this.deletionError = error?.error?.message || 'Não foi possível excluir o cargo.'; this.deletionLoading = false; this.teamRoles.deletionImpactCommunity(communityId, role.id).subscribe({ next: impact => this.deletionImpact = impact }); } }
    });
  }

  openDemandCreate(): void { if (this.demandSaving || !this.canCreateDemand()) return; this.editingDemand = undefined; this.demandDraft = { name: '', description: null, roleIds: [] }; this.demandFormErrorMessage = ''; this.demandFormOpen = true; }
  openDemandEdit(demand: CommunityTeamDemand): void { if (this.demandSaving || !this.canManageDemand(demand)) return; this.editingDemand = demand; this.demandDraft = { name: demand.name, description: demand.description, roleIds: [...demand.roleIds] }; this.demandFormErrorMessage = ''; this.demandFormOpen = true; }
  closeDemandForm(): void { if (!this.demandSaving) this.demandFormOpen = false; }
  saveDemand(): void {
    if (this.selectedCommunityId == null || !this.demandDraft.name.trim() || this.demandSaving || !this.canSaveDemandDraft()) return;
    const communityId = this.selectedCommunityId; this.demandSaving = true; this.demandFormErrorMessage = '';
    const request = { ...this.demandDraft, name: this.demandDraft.name.trim(), description: this.demandDraft.description?.trim() || null };
    const response = this.editingDemand
      ? this.teamDemands.updateCommunity(communityId, this.editingDemand.id, request)
      : this.teamDemands.createCommunity(communityId, request);
    response.subscribe({ next: () => { this.demandSaving = false; if (communityId === this.selectedCommunityId) { this.demandFormOpen = false; this.loadDemands(); } }, error: error => { this.demandSaving = false; if (communityId === this.selectedCommunityId) { this.demandFormErrorMessage = error?.error?.message || 'Não foi possível salvar a demanda.'; } } });
  }
  toggleDemandRole(role: CommunityTeamRole): void {
    if (!this.canToggleDemandRole(role)) return;
    this.demandDraft.roleIds = this.demandDraft.roleIds.includes(role.id)
      ? this.demandDraft.roleIds.filter(id => id !== role.id)
      : [...this.demandDraft.roleIds, role.id];
  }
  demandRoles(demand: CommunityTeamDemand): CommunityTeamRole[] { return demand.roleIds.map(id => this.roles.find(role => role.id === id)).filter((role): role is CommunityTeamRole => !!role); }
  demandsForRole(role: CommunityTeamRole): CommunityTeamDemand[] { return this.demands.filter(demand => demand.roleIds.includes(role.id)); }
  rolesForDemandView(): CommunityTeamRole[] {
    const assignedRoleIds = new Set(this.demands.flatMap(demand => demand.roleIds));
    return flattenTeamOrgChart(this.roles, role => role.active || this.showInactive || assignedRoleIds.has(role.id));
  }
  rebuildDemandViews(): void {
    const search = this.demandView === 'demand' ? this.demandSearchTerm : '';
    this.visibleDemands = this.demands.filter(demand => this.matchesSearch(demand.name, search)
      && this.matchesAssignmentFilter(demand.roleIds.length > 0, this.demandAssignmentFilter));
    this.rebuildDemandRolesView();
  }
  rebuildDemandRolesView(): void {
    const search = this.demandView === 'role' ? this.demandSearchTerm : '';
    this.visibleDemandRoles = this.rolesForDemandView().filter(role => this.matchesSearch(role.name, search)
      && this.matchesAssignmentFilter(this.demandsForRole(role).length > 0, this.roleDemandFilter));
  }
  refreshRoleViews(): void { this.rebuildTree(); this.rebuildDemandRolesView(); }
  setStructureView(view: 'list' | 'chart'): void { this.structureView = view; }
  setDemandView(view: 'demand' | 'role'): void {
    if (this.demandView === view) return;
    this.demandView = view;
    this.demandSearchTerm = '';
    this.demandFiltersOpen = false;
    this.rebuildDemandViews();
  }
  onRoleSearchChange(): void { this.rebuildTree(); }
  onDemandSearchChange(): void { this.rebuildDemandViews(); }
  structureFilterLabel(): string { return this.showInactive ? 'Filtros (1)' : 'Filtros'; }
  demandFilterLabel(): string {
    const activeFilter = this.demandView === 'demand' ? this.demandAssignmentFilter : this.roleDemandFilter;
    return activeFilter === 'all' ? 'Filtros' : 'Filtros (1)';
  }
  setDemandAssignmentFilter(filter: AssignmentFilter): void { this.demandAssignmentFilter = filter; this.rebuildDemandViews(); }
  setRoleDemandFilter(filter: AssignmentFilter): void { this.roleDemandFilter = filter; this.rebuildDemandViews(); }
  roleLabel(role: CommunityTeamRole): string { return role.active ? role.name : `${role.name} (inativo)`; }
  openDemandDelete(demand: CommunityTeamDemand): void { if (!this.demandSaving && this.canManageDemand(demand)) { this.demandDeleteError = ''; this.deletingDemand = demand; } }
  confirmDemandDelete(): void { if (!this.deletingDemand || this.selectedCommunityId == null || !this.canManageDemand(this.deletingDemand)) return; const demand = this.deletingDemand; const communityId = this.selectedCommunityId; this.demandSaving = true; this.demandDeleteError = ''; this.teamDemands.deleteCommunity(communityId, demand.id).subscribe({ next: () => { this.demandSaving = false; if (communityId === this.selectedCommunityId) { this.demandDeleteError = ''; this.deletingDemand = undefined; this.loadDemands(); } }, error: error => { this.demandSaving = false; if (communityId === this.selectedCommunityId) this.demandDeleteError = error?.error?.message || 'Não foi possível excluir a demanda.'; } }); }

  toggleOrgMembers(): void {
    if (!this.hasCapability('MEMBERS_VIEW')) return;
    this.showOrgMembers = !this.showOrgMembers;
    if (this.showOrgMembers) this.rolesForCurrentTeamView().forEach(role => this.loadRoleMembers(role.id));
  }

  membersForRole(roleId: number): TeamMemberRef[] {
    return this.roleMembers[roleId] ?? [];
  }

  openRoleMembers(role: CommunityTeamRole): void {
    if (this.selectedCommunityId == null || this.memberSavingUserId !== undefined || !this.canViewRoleMembers(role.id)) return;
    this.managingMembersRole = role;
    this.assignedMembers = [];
    this.memberCandidates = [];
    this.memberSearchTerm = '';
    this.memberCandidateTotal = 0;
    this.memberError = '';
    this.loadAssignedMembers(role);
    if (this.canAssignRole(role.id)) this.searchMemberCandidates();
  }

  closeRoleMembers(): void {
    if (this.memberSavingUserId !== undefined) return;
    this.managingMembersRole = undefined;
    this.assignedMembers = [];
    this.memberCandidates = [];
    this.memberAssignmentsLoading = false;
    this.memberSearchLoading = false;
    this.memberError = '';
    this.memberSearchGeneration++;
  }

  searchMemberCandidates(): void {
    if (this.selectedCommunityId == null || !this.managingMembersRole || !this.canAssignRole(this.managingMembersRole.id)) return;
    const communityId = this.selectedCommunityId;
    const roleId = this.managingMembersRole.id;
    const generation = ++this.memberSearchGeneration;
    this.memberSearchLoading = true;
    this.memberError = '';
    this.teamAssignments.listMemberCandidatesCommunity(
      communityId,
      roleId,
      1,
      100,
      this.memberSearchTerm
    ).subscribe({
      next: response => {
        if (communityId !== this.selectedCommunityId || roleId !== this.managingMembersRole?.id || generation !== this.memberSearchGeneration) return;
        this.memberCandidates = response.items;
        this.memberCandidateTotal = response.pagination.totalElements;
        this.memberSearchLoading = false;
      },
      error: error => {
        if (communityId !== this.selectedCommunityId || roleId !== this.managingMembersRole?.id || generation !== this.memberSearchGeneration) return;
        this.memberSearchLoading = false;
        this.memberError = error?.error?.message || 'Não foi possível carregar os candidatos deste cargo.';
      }
    });
  }

  assignMember(member: TeamMemberRef): void {
    const role = this.managingMembersRole;
    if (this.selectedCommunityId == null || !role || !this.canAssignRole(role.id) || this.memberSavingUserId !== undefined || this.isMemberAssigned(member.userId)) return;
    const communityId = this.selectedCommunityId;
    this.memberSavingUserId = member.userId;
    this.memberError = '';
    this.teamAssignments.assignCommunity(communityId, role.id, member.userId).subscribe({
      next: () => {
        this.memberSavingUserId = undefined;
        if (communityId === this.selectedCommunityId && role.id === this.managingMembersRole?.id) this.loadAssignedMembers(role);
      },
      error: error => {
        this.memberSavingUserId = undefined;
        if (communityId === this.selectedCommunityId && role.id === this.managingMembersRole?.id) {
          this.memberError = error?.error?.message || 'Não foi possível atribuir o membro ao cargo.';
        }
      }
    });
  }

  removeMember(member: TeamMemberRef): void {
    const role = this.managingMembersRole;
    if (this.selectedCommunityId == null || !role || !this.canAssignRole(role.id) || this.memberSavingUserId !== undefined) return;
    const communityId = this.selectedCommunityId;
    this.memberSavingUserId = member.userId;
    this.memberError = '';
    this.teamAssignments.removeCommunity(communityId, role.id, member.userId).subscribe({
      next: () => {
        this.memberSavingUserId = undefined;
        if (communityId === this.selectedCommunityId && role.id === this.managingMembersRole?.id) this.loadAssignedMembers(role);
      },
      error: error => {
        this.memberSavingUserId = undefined;
        if (communityId === this.selectedCommunityId && role.id === this.managingMembersRole?.id) {
          this.memberError = error?.error?.message || 'Não foi possível remover o membro do cargo.';
        }
      }
    });
  }

  isMemberAssigned(userId: number): boolean {
    return this.assignedMembers.some(member => member.userId === userId);
  }

  private loadAssignedMembers(role: CommunityTeamRole): void {
    if (this.selectedCommunityId == null || !this.canViewRoleMembers(role.id)) return;
    const communityId = this.selectedCommunityId;
    const roleId = role.id;
    const generation = (this.roleMemberLoadGenerations[roleId] ?? 0) + 1;
    this.roleMemberLoadGenerations = { ...this.roleMemberLoadGenerations, [roleId]: generation };
    this.memberAssignmentsLoading = true;
    this.roleMemberStates = { ...this.roleMemberStates, [roleId]: 'loading' };
    this.teamAssignments.listMembersCommunity(communityId, roleId).subscribe({
      next: members => {
        if (communityId !== this.selectedCommunityId || generation !== this.roleMemberLoadGenerations[roleId]) return;
        this.roleMembers = { ...this.roleMembers, [roleId]: members };
        this.roleMemberStates = { ...this.roleMemberStates, [roleId]: 'loaded' };
        if (this.managingMembersRole?.id === roleId) {
          this.assignedMembers = members;
          this.memberAssignmentsLoading = false;
        }
      },
      error: error => {
        if (communityId !== this.selectedCommunityId || generation !== this.roleMemberLoadGenerations[roleId]) return;
        this.roleMemberStates = { ...this.roleMemberStates, [roleId]: 'error' };
        if (this.managingMembersRole?.id === roleId) {
          this.memberAssignmentsLoading = false;
          this.memberError = error?.error?.message || 'Não foi possível carregar os membros do cargo.';
        }
      }
    });
  }

  private loadRoleMembers(roleId: number): void {
    if (this.selectedCommunityId == null || !this.hasCapability('MEMBERS_VIEW')) return;
    const currentState = this.roleMemberStates[roleId];
    if (currentState === 'loading' || currentState === 'loaded') return;
    const communityId = this.selectedCommunityId;
    this.roleMemberStates = { ...this.roleMemberStates, [roleId]: 'loading' };
    this.teamAssignments.listMembersCommunity(communityId, roleId).subscribe({
      next: members => {
        if (communityId !== this.selectedCommunityId) return;
        this.roleMembers = { ...this.roleMembers, [roleId]: members };
        this.roleMemberStates = { ...this.roleMemberStates, [roleId]: 'loaded' };
      },
      error: () => {
        if (communityId === this.selectedCommunityId) {
          this.roleMemberStates = { ...this.roleMemberStates, [roleId]: 'error' };
        }
      }
    });
  }

  availableParents(): CommunityTeamRole[] {
    const invalid = this.editingRole
      ? new Set([this.editingRole.id, ...this.descendantIds(this.editingRole.id)])
      : new Set<number>();

    return this.roles.filter(role => {
      if (invalid.has(role.id)) return false;
      const activeEnough = role.active || role.id === this.editingRole?.parentRoleId;
      if (!activeEnough) return false;
      return this.editingRole
        ? this.canUseStructureParent(this.editingRole.id, role.id)
        : this.canUseCreateParent(role.id);
    });
  }

  hasCapability(code: string): boolean {
    return this.selectedAccess?.capabilities.includes(code) === true;
  }

  teamScope(code: string): CommunityAccess['teamScopes'][number] | undefined {
    return this.selectedAccess?.teamScopes.find(scope => scope.capability === code);
  }

  canCreateRole(): boolean {
    if (!this.hasCapability('TEAM_MANAGE_STRUCTURE')) return false;
    const scope = this.teamScope('TEAM_MANAGE_STRUCTURE');
    return scope?.unrestricted === true || (scope?.sourceRoleIds.length ?? 0) > 0;
  }

  canCreateRootRole(): boolean {
    return this.teamScope('TEAM_MANAGE_STRUCTURE')?.unrestricted === true;
  }

  canManageStructureRole(roleId: number): boolean {
    return this.canManageTeamTarget('TEAM_MANAGE_STRUCTURE', roleId);
  }

  canAssignRole(roleId: number): boolean {
    return this.canManageTeamTarget('TEAM_ASSIGN_MEMBERS', roleId);
  }

  canViewRoleMembers(roleId: number): boolean {
    return this.hasCapability('MEMBERS_VIEW') || this.canAssignRole(roleId);
  }

  canShowOrgMembers(): boolean {
    return this.hasCapability('MEMBERS_VIEW');
  }

  canCreateDemand(): boolean {
    if (!this.hasCapability('TEAM_MANAGE_DEMANDS')) return false;
    const scope = this.teamScope('TEAM_MANAGE_DEMANDS');
    return scope?.unrestricted === true || (scope?.targetRoleIds.length ?? 0) > 0;
  }

  canManageDemand(demand: CommunityTeamDemand): boolean {
    if (!this.hasCapability('TEAM_MANAGE_DEMANDS')) return false;
    const scope = this.teamScope('TEAM_MANAGE_DEMANDS');
    if (scope?.unrestricted) return true;
    if (!demand.roleIds.length) return false;
    return this.roleSetFitsOneSource('TEAM_MANAGE_DEMANDS', demand.roleIds);
  }

  demandRoleOptions(): CommunityTeamRole[] {
    const scope = this.teamScope('TEAM_MANAGE_DEMANDS');
    if (!scope) return [];
    const allowed = scope.unrestricted ? null : new Set(scope.targetRoleIds);
    return this.roles.filter(role =>
      (role.active || this.demandDraft.roleIds.includes(role.id))
      && (allowed === null || allowed.has(role.id))
    );
  }

  canSaveDemandDraft(): boolean {
    if (!this.hasCapability('TEAM_MANAGE_DEMANDS')) return false;
    const scope = this.teamScope('TEAM_MANAGE_DEMANDS');
    if (scope?.unrestricted) return true;
    if (!this.demandDraft.roleIds.length) return false;

    const combined = this.editingDemand
      ? [...new Set([...this.editingDemand.roleIds, ...this.demandDraft.roleIds])]
      : this.demandDraft.roleIds;
    return this.roleSetFitsOneSource('TEAM_MANAGE_DEMANDS', combined);
  }

  canToggleDemandRole(role: CommunityTeamRole): boolean {
    if (this.demandSaving) return false;
    if (!role.active && !this.demandDraft.roleIds.includes(role.id)) return false;
    const nextIds = this.demandDraft.roleIds.includes(role.id)
      ? this.demandDraft.roleIds.filter(id => id !== role.id)
      : [...this.demandDraft.roleIds, role.id];

    const scope = this.teamScope('TEAM_MANAGE_DEMANDS');
    if (scope?.unrestricted) return true;
    if (!nextIds.length) return true;
    const combined = this.editingDemand
      ? [...new Set([...this.editingDemand.roleIds, ...nextIds])]
      : nextIds;
    return this.roleSetFitsOneSource('TEAM_MANAGE_DEMANDS', combined);
  }

  setTeamViewMode(mode: TeamViewMode): void {
    if (mode === 'mine' && !(this.selectedAccess?.activeRoleIds.length)) return;
    this.teamViewMode = mode;
    this.showOrgMembers = false;
    this.roleMembers = {};
    this.roleMemberStates = {};
    this.refreshRoleViews();
  }

  hasMyTeam(): boolean {
    return (this.selectedAccess?.activeRoleIds.length ?? 0) > 0;
  }

  private canManageTeamTarget(capability: string, roleId: number): boolean {
    if (!this.hasCapability(capability)) return false;
    const scope = this.teamScope(capability);
    return scope?.unrestricted === true || scope?.targetRoleIds.includes(roleId) === true;
  }

  private canUseCreateParent(parentRoleId: number): boolean {
    const scope = this.teamScope('TEAM_MANAGE_STRUCTURE');
    if (scope?.unrestricted) return true;
    if (!scope) return false;
    if (scope.sourceRoleIds.includes(parentRoleId)) return true;
    return scope.targetRoleIds.includes(parentRoleId);
  }

  private canUseStructureParent(targetRoleId: number, parentRoleId: number): boolean {
    const scope = this.teamScope('TEAM_MANAGE_STRUCTURE');
    if (scope?.unrestricted) return true;
    if (!scope) return false;
    return this.sourceScopeSets('TEAM_MANAGE_STRUCTURE').some(entry =>
      entry.descendants.has(targetRoleId)
      && (entry.sourceRoleId === parentRoleId || entry.descendants.has(parentRoleId))
    );
  }

  private roleSetFitsOneSource(capability: string, roleIds: number[]): boolean {
    return this.sourceScopeSets(capability).some(entry =>
      roleIds.every(roleId => entry.descendants.has(roleId))
    );
  }

  private sourceScopeSets(capability: string): { sourceRoleId: number; descendants: Set<number> }[] {
    const scope = this.teamScope(capability);
    if (!scope || scope.unrestricted) return [];
    return scope.sourceRoleIds.map(sourceRoleId => ({
      sourceRoleId,
      descendants: new Set(this.descendantIds(sourceRoleId))
    }));
  }

  parentLabel(role: CommunityTeamRole): string {
    return role.active ? role.name : `${role.name} (inativo)`;
  }

  private descendantIds(roleId: number, visited = new Set<number>()): number[] {
    if (visited.has(roleId)) return [];
    visited.add(roleId);
    const descendants = this.roles.filter(role => role.parentRoleId === roleId);
    return descendants.flatMap(role => [role.id, ...this.descendantIds(role.id, visited)]);
  }

  rebuildTree(): void {
    const teamViewRoles = this.rolesForCurrentTeamView();
    const rolesVisibleByStatus = teamViewRoles.filter(role => this.showInactive || role.active);
    this.filteredRoleList = rolesVisibleByStatus.filter(role => this.matchesSearch(role.name, this.roleSearchTerm));
    this.filteredOrgChartRoles = this.rolesForOrgChart(rolesVisibleByStatus, this.filteredRoleList);
    const rows: { role: CommunityTeamRole; depth: number }[] = [];
    const append = (node: ReturnType<typeof buildTeamOrgChart>[number], depth: number): void => {
      rows.push({ role: node.role, depth });
      node.children.forEach(child => append(child, depth + 1));
    };
    buildTeamOrgChart(this.filteredRoleList, () => true, this.roles).forEach(root => append(root, 0));
    this.visibleRoles = rows;
  }

  private rolesForCurrentTeamView(): CommunityTeamRole[] {
    if (this.teamViewMode === 'all' || !this.hasMyTeam()) return this.roles;

    const included = new Set<number>();
    const byId = new Map(this.roles.map(role => [role.id, role]));
    for (const roleId of this.selectedAccess?.activeRoleIds ?? []) {
      included.add(roleId);
      this.descendantIds(roleId).forEach(id => included.add(id));
      const role = byId.get(roleId);
      if (role?.parentRoleId != null) included.add(role.parentRoleId);
    }
    return this.roles.filter(role => included.has(role.id));
  }

  private rolesForOrgChart(rolesVisibleByStatus: CommunityTeamRole[], matches: CommunityTeamRole[]): CommunityTeamRole[] {
    if (!this.normalizedSearch(this.roleSearchTerm)) return rolesVisibleByStatus;
    const allById = new Map(this.roles.map(role => [role.id, role]));
    const visibleIds = new Set(rolesVisibleByStatus.map(role => role.id));
    const includedIds = new Set(matches.map(role => role.id));
    for (const role of matches) {
      const visited = new Set<number>([role.id]);
      let parentId = role.parentRoleId;
      while (parentId !== null && !visited.has(parentId)) {
        visited.add(parentId);
        const parent = allById.get(parentId);
        if (!parent) break;
        if (visibleIds.has(parent.id)) includedIds.add(parent.id);
        parentId = parent.parentRoleId;
      }
    }
    return rolesVisibleByStatus.filter(role => includedIds.has(role.id));
  }

  private matchesSearch(name: string, search: string): boolean { return this.normalizedSearch(name).includes(this.normalizedSearch(search)); }
  private normalizedSearch(value: string): string { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim(); }
  private matchesAssignmentFilter(assigned: boolean, filter: AssignmentFilter): boolean {
    return filter === 'all' || (filter === 'assigned' ? assigned : !assigned);
  }
}
