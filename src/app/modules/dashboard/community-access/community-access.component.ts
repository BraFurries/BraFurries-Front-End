import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { EMPTY, Observable, Subject, concatMap, finalize, forkJoin, from, takeUntil, tap } from 'rxjs';

import { CommunityAccess } from '../../../core/services/community-access.service';
import {
  CommunityContextService,
  CommunityContextState
} from '../../../core/services/community-context.service';
import {
  CommunityCapabilityDefinition,
  CommunityCapabilityService,
  CommunityMemberSummary,
  DirectCapabilityGrants,
  RoleCapabilityGrants
} from '../../../core/services/community-capability.service';
import { CommunityTeamRole } from '../../../core/services/community-team-roles.service';

interface CapabilityDraft {
  persisted: Set<string>;
  selected: Set<string>;
}

interface PendingCapabilityChange {
  target: 'member' | 'role';
  targetId: number;
  code: string;
  granted: boolean;
}

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
  successMessage = '';
  saving = false;

  private destroyed = false;
  private readonly destroy$ = new Subject<void>();
  private readonly communityChanged$ = new Subject<void>();
  private readonly memberDrafts = new Map<number, CapabilityDraft>();
  private readonly roleDrafts = new Map<number, CapabilityDraft>();
  private activeCommunityId: number | null = null;
  private memberRequestId = 0;
  private roleRequestId = 0;

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

  get pendingCount(): number {
    let total = 0;
    for (const draft of this.memberDrafts.values()) {
      total += this.countDifferences(draft);
    }
    for (const draft of this.roleDrafts.values()) {
      total += this.countDifferences(draft);
    }
    return total;
  }

  get dirty(): boolean {
    return this.pendingCount > 0;
  }

  get canEditSelectedMember(): boolean {
    return !this.saving && !this.loadingMemberGrants
      && !!this.selectedMember && this.memberDrafts.has(this.selectedMember.userId);
  }

  get canEditSelectedRole(): boolean {
    return !this.saving && !this.loadingRoleGrants
      && !!this.selectedRole && this.roleDrafts.has(this.selectedRole.id);
  }

  get canSave(): boolean {
    return this.dirty && !this.saving && !this.loadingTargets
      && this.isCurrentCommunity(this.activeCommunityId)
      && !!(this.selectedAccess?.owner || this.selectedAccess?.communityAdmin);
  }

  ngOnInit(): void {
    this.communityContext.state$
      .pipe(takeUntil(this.destroy$))
      .subscribe(state => this.applyCommunityContext(state));
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.communityChanged$.next();
    this.destroy$.next();
    this.destroy$.complete();
    this.communityChanged$.complete();
  }

  /** Prevent leaving the Community tab with unsaved grants. */
  canDeactivate(): boolean {
    if (this.saving) return false;
    if (!this.dirty) return true;
    return typeof window === 'undefined'
      || window.confirm('Há alterações de acesso não salvas. Deseja sair e descartá-las?');
  }

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (!this.dirty && !this.saving) return;
    event.preventDefault();
    event.returnValue = '';
  }

  private applyCommunityContext(state: CommunityContextState): void {
    const communityId = state.activeCommunity?.communityId ?? null;
    if (state.status !== 'ready' || communityId === null || !state.activeAccess
      || communityId === this.activeCommunityId) return;

    const hadPending = this.dirty;
    const wasSaving = this.saving;
    // Cancel in-flight subscriptions and keep grants from different tenants separate.
    this.communityChanged$.next();
    this.activeCommunityId = communityId;
    this.memberRequestId++;
    this.roleRequestId++;
    this.memberDrafts.clear();
    this.roleDrafts.clear();
    this.selectedMember = undefined;
    this.selectedRole = undefined;
    this.directGrants = new Set<string>();
    this.roleGrants = new Set<string>();
    this.loadingMemberGrants = false;
    this.loadingRoleGrants = false;
    this.members = [];
    this.roles = [];
    this.catalog = [];
    this.memberSearch = '';
    this.successMessage = '';
    this.errorMessage = wasSaving
      ? 'A Community foi alterada durante o salvamento. Confira o estado anterior antes de editar novamente.'
      : hadPending
        ? 'As alterações não salvas da Community anterior foram descartadas.'
        : '';
    this.loadTargets();
  }

  private isCurrentCommunity(communityId: number | null): communityId is number {
    return !this.destroyed && communityId !== null && communityId === this.activeCommunityId
      && communityId === this.selectedCommunityId;
  }

  loadTargets(): void {
    const communityId = this.selectedCommunityId;
    if (!this.isCurrentCommunity(communityId)) return;
    this.loadingTargets = true;

    forkJoin({
      catalog: this.capabilities.catalog(communityId),
      members: this.capabilities.listMembers(communityId, 1, 100, this.memberSearch),
      roles: this.capabilities.listRoles(communityId)
    }).pipe(takeUntil(this.communityChanged$), takeUntil(this.destroy$)).subscribe({
      next: ({ catalog, members, roles }) => {
        if (!this.isCurrentCommunity(communityId)) return;
        this.catalog = catalog.capabilities;
        this.members = members.items;
        this.memberTotal = members.pagination.totalElements;
        this.roles = roles;
        this.loadingTargets = false;
      },
      error: error => {
        if (!this.isCurrentCommunity(communityId)) return;
        this.loadingTargets = false;
        this.errorMessage = error?.error?.message || 'Não foi possível carregar os alvos de acesso da Community.';
      }
    });
  }

  searchMembers(): void {
    const communityId = this.selectedCommunityId;
    if (!this.isCurrentCommunity(communityId) || this.saving) return;
    this.loadingTargets = true;
    this.errorMessage = '';
    this.capabilities.listMembers(communityId, 1, 100, this.memberSearch)
      .pipe(takeUntil(this.communityChanged$), takeUntil(this.destroy$)).subscribe({
        next: response => {
          if (!this.isCurrentCommunity(communityId)) return;
          this.members = response.items;
          this.memberTotal = response.pagination.totalElements;
          this.loadingTargets = false;
          if (this.selectedMember && !this.members.some(member => member.userId === this.selectedMember?.userId)) {
            this.memberRequestId++;
            this.selectedMember = undefined;
            this.directGrants = new Set<string>();
            this.loadingMemberGrants = false;
          }
        },
        error: error => {
          if (!this.isCurrentCommunity(communityId)) return;
          this.loadingTargets = false;
          this.errorMessage = error?.error?.message || 'Não foi possível pesquisar os membros.';
        }
      });
  }

  selectMember(member: CommunityMemberSummary): void {
    const communityId = this.selectedCommunityId;
    if (!this.isCurrentCommunity(communityId) || this.saving) return;
    const requestId = ++this.memberRequestId;
    this.selectedMember = member;
    this.loadingMemberGrants = false;
    this.errorMessage = '';

    const cached = this.memberDrafts.get(member.userId);
    if (cached) {
      this.directGrants = cached.selected;
      return;
    }

    this.directGrants = new Set<string>();
    this.loadingMemberGrants = true;
    this.capabilities.directGrants(communityId, member.userId)
      .pipe(takeUntil(this.communityChanged$), takeUntil(this.destroy$)).subscribe({
        next: response => {
          if (!this.isCurrentCommunity(communityId) || requestId !== this.memberRequestId) return;
          const draft = this.createDraft(response.capabilities);
          this.memberDrafts.set(member.userId, draft);
          this.directGrants = draft.selected;
          this.loadingMemberGrants = false;
        },
        error: error => {
          if (!this.isCurrentCommunity(communityId) || requestId !== this.memberRequestId) return;
          this.loadingMemberGrants = false;
          this.errorMessage = error?.error?.message || 'Não foi possível carregar os acessos diretos deste membro.';
        }
      });
  }

  selectRole(role: CommunityTeamRole): void {
    const communityId = this.selectedCommunityId;
    if (!this.isCurrentCommunity(communityId) || this.saving) return;
    const requestId = ++this.roleRequestId;
    this.selectedRole = role;
    this.loadingRoleGrants = false;
    this.errorMessage = '';

    const cached = this.roleDrafts.get(role.id);
    if (cached) {
      this.roleGrants = cached.selected;
      return;
    }

    this.roleGrants = new Set<string>();
    this.loadingRoleGrants = true;
    this.capabilities.roleGrants(communityId, role.id)
      .pipe(takeUntil(this.communityChanged$), takeUntil(this.destroy$)).subscribe({
        next: response => {
          if (!this.isCurrentCommunity(communityId) || requestId !== this.roleRequestId) return;
          const draft = this.createDraft(response.capabilities);
          this.roleDrafts.set(role.id, draft);
          this.roleGrants = draft.selected;
          this.loadingRoleGrants = false;
        },
        error: error => {
          if (!this.isCurrentCommunity(communityId) || requestId !== this.roleRequestId) return;
          this.loadingRoleGrants = false;
          this.errorMessage = error?.error?.message || 'Não foi possível carregar os acessos deste cargo.';
        }
      });
  }

  directDefinitions(): CommunityCapabilityDefinition[] {
    return this.catalog.filter(definition =>
      definition.directGrantAllowed
      && (definition.code !== 'COMMUNITY_ADMIN' || this.selectedAccess?.canManageCommunityAdmins === true)
    );
  }

  roleDefinitions(): CommunityCapabilityDefinition[] {
    return this.catalog.filter(definition => definition.roleGrantAllowed);
  }

  hasDirect(code: string): boolean {
    return this.directGrants.has(code);
  }

  hasRole(code: string): boolean {
    return this.roleGrants.has(code);
  }

  toggleDirect(definition: CommunityCapabilityDefinition): void {
    const communityId = this.selectedCommunityId;
    const person = this.selectedMember;
    if (!this.isCurrentCommunity(communityId) || !person || this.saving || this.loadingMemberGrants) return;
    if (!definition.directGrantAllowed
      || (definition.code === 'COMMUNITY_ADMIN' && !this.selectedAccess?.canManageCommunityAdmins)) return;

    const draft = this.memberDrafts.get(person.userId);
    if (!draft) return;
    this.toggleDraft(draft, definition.code);
    this.directGrants = draft.selected;
    this.successMessage = '';
    this.errorMessage = '';
  }

  toggleRole(definition: CommunityCapabilityDefinition): void {
    const communityId = this.selectedCommunityId;
    const role = this.selectedRole;
    if (!this.isCurrentCommunity(communityId) || !role || this.saving || this.loadingRoleGrants
      || !definition.roleGrantAllowed) return;

    const draft = this.roleDrafts.get(role.id);
    if (!draft) return;
    this.toggleDraft(draft, definition.code);
    this.roleGrants = draft.selected;
    this.successMessage = '';
    this.errorMessage = '';
  }

  discardChanges(): void {
    if (this.saving) return;
    for (const draft of [...this.memberDrafts.values(), ...this.roleDrafts.values()]) {
      draft.selected = new Set(draft.persisted);
    }
    if (this.selectedMember) {
      this.directGrants = this.memberDrafts.get(this.selectedMember.userId)?.selected ?? new Set<string>();
    }
    if (this.selectedRole) {
      this.roleGrants = this.roleDrafts.get(this.selectedRole.id)?.selected ?? new Set<string>();
    }
    this.errorMessage = '';
    this.successMessage = 'Alterações não salvas descartadas.';
  }

  saveChanges(): void {
    if (!this.canSave) return;
    const communityId = this.activeCommunityId!;
    const changes = this.pendingChanges();
    if (!changes.length) return;
    this.saving = true;
    this.errorMessage = '';
    this.successMessage = '';
    let saved = 0;

    from(changes).pipe(
      concatMap(change => {
        if (!this.isCurrentCommunity(communityId)) return EMPTY;
        return this.persistChange(communityId, change).pipe(
          tap(response => {
            if (!this.isCurrentCommunity(communityId)) return;
            this.acknowledgeChange(change, response.capabilities);
            saved++;
          })
        );
      }),
      takeUntil(this.communityChanged$),
      takeUntil(this.destroy$),
      finalize(() => { this.saving = false; })
    ).subscribe({
      complete: () => {
        if (!this.isCurrentCommunity(communityId)) return;
        if (saved) this.refreshActiveAccess();
        this.successMessage = `${saved} ${saved === 1 ? 'alteração salva' : 'alterações salvas'} com sucesso.`;
      },
      error: error => {
        if (!this.isCurrentCommunity(communityId)) return;
        if (saved) this.refreshActiveAccess();
        this.errorMessage = `${saved} de ${changes.length} alterações confirmadas. `
          + (error?.error?.message || 'Não foi possível concluir o salvamento. Os acessos restantes continuam pendentes.');
      }
    });
  }

  private createDraft(codes: string[]): CapabilityDraft {
    return { persisted: new Set(codes), selected: new Set(codes) };
  }

  private toggleDraft(draft: CapabilityDraft, code: string): void {
    if (draft.selected.has(code)) draft.selected.delete(code);
    else draft.selected.add(code);
  }

  private countDifferences(draft: CapabilityDraft): number {
    return [...new Set([...draft.persisted, ...draft.selected])]
      .filter(code => draft.selected.has(code) !== draft.persisted.has(code)).length;
  }

  private pendingChanges(): PendingCapabilityChange[] {
    const changes: PendingCapabilityChange[] = [];
    const collect = (target: PendingCapabilityChange['target'], drafts: Map<number, CapabilityDraft>) => {
      for (const [targetId, draft] of drafts) {
        for (const code of new Set([...draft.persisted, ...draft.selected])) {
          const granted = draft.selected.has(code);
          if (granted !== draft.persisted.has(code)) {
            changes.push({ target, targetId, code, granted });
          }
        }
      }
    };
    collect('member', this.memberDrafts);
    collect('role', this.roleDrafts);
    // Revoke before granting so failures do not leave unnecessarily broad access.
    return changes.sort((a, b) => Number(a.granted) - Number(b.granted));
  }

  private persistChange(
    communityId: number, change: PendingCapabilityChange
  ): Observable<DirectCapabilityGrants | RoleCapabilityGrants> {
    if (change.target === 'member') {
      return change.granted
        ? this.capabilities.grantDirect(communityId, change.targetId, change.code)
        : this.capabilities.revokeDirect(communityId, change.targetId, change.code);
    }
    return change.granted
      ? this.capabilities.grantRole(communityId, change.targetId, change.code)
      : this.capabilities.revokeRole(communityId, change.targetId, change.code);
  }

  private acknowledgeChange(change: PendingCapabilityChange, grantedCodes: string[]): void {
    const drafts = change.target === 'member' ? this.memberDrafts : this.roleDrafts;
    const draft = drafts.get(change.targetId);
    if (draft) draft.persisted = new Set(grantedCodes);
  }

  private refreshActiveAccess(): void {
    this.communityContext.refreshActiveAccess()
      .pipe(takeUntil(this.destroy$), takeUntil(this.communityChanged$)).subscribe({
        error: () => {
          this.errorMessage ||= 'Alterações salvas, mas não foi possível atualizar o acesso da sessão.';
        }
      });
  }

  capabilityLabel(code: string): string {
    const labels: Record<string, string> = {
      COMMUNITY_ADMIN: 'Administrador da Community',
      TEAM_ASSIGN_MEMBERS: 'Atribuir membros aos cargos abaixo',
      TEAM_MANAGE_STRUCTURE: 'Gerenciar cargos abaixo',
      TEAM_MANAGE_DEMANDS: 'Gerenciar demandas abaixo',
      RECRUITMENT_MANAGE_PROCESSES: 'Gerenciar processos seletivos',
      RECRUITMENT_PUBLISH_PROCESSES: 'Publicar processos seletivos',
      RECRUITMENT_REVIEW_APPLICATIONS: 'Avaliar candidaturas',
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
    const descriptions: Record<string, string> = {
      RECRUITMENT_MANAGE_PROCESSES: 'Criar, configurar e gerenciar processos seletivos e suas etapas.',
      RECRUITMENT_PUBLISH_PROCESSES: 'Publicar e administrar a divulgação dos processos seletivos.',
      RECRUITMENT_REVIEW_APPLICATIONS: 'Analisar inscrições e participar das avaliações de candidaturas.'
    };
    if (descriptions[definition.code]) return descriptions[definition.code];
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
