import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AdminService } from '../../../../../../core/services/admin.service';
import { UserPermissionsService } from '../../../../../../core/services/user-permissions.service';
import {
  AdminIdentityModerationHistory,
  AdminDiscordMemberState,
  AdminDiscordIdentityPreview,
  AdminUserCommunityContext,
  AdminUserIdentity,
  AdminUserProfile,
  AdminUserReliability,
  AdminUserRole,
  AdminUserItem,
  IdentityBanHistory,
  IdentityNoteHistory,
  IdentityUserSummary,
  IdentityWarningHistory,
  UserIdentityLinkStatus,
  UserIdentityLinkView
} from '../../../../../../shared/models/api/admin/admin';
import { catchError, forkJoin, of } from 'rxjs';

type AdminUserTab = 'resumo' | 'identidade' | 'comunidades' | 'contexto' | 'eventos' | 'moderacao' | 'progresso' | 'economia' | 'vip' | 'confiabilidade' | 'administracao';
type ModerationTypeFilter = 'all' | 'warn' | 'ban' | 'note';

@Component({
  selector: 'app-admin-user-profile',
  standalone: false,
  templateUrl: './perfil-usuario.component.html',
  styleUrls: ['./perfil-usuario.component.scss']
})
export class AdminUserProfileComponent implements OnInit {
  readonly tabs: { id: AdminUserTab; label: string; local: boolean }[] = [
    { id: 'resumo', label: 'Resumo', local: false },
    { id: 'identidade', label: 'Identidade', local: false },
    { id: 'comunidades', label: 'Comunidades', local: false },
    { id: 'contexto', label: 'Servidor', local: true },
    { id: 'eventos', label: 'Eventos', local: false },
    { id: 'moderacao', label: 'Moderação', local: false },
    { id: 'progresso', label: 'Progressão', local: true },
    { id: 'economia', label: 'Economia', local: true },
    { id: 'vip', label: 'VIP e cargos', local: true },
    { id: 'confiabilidade', label: 'Confiabilidade', local: false },
    { id: 'administracao', label: 'Administração', local: false }
  ];
  userId = 0;
  activeTab: AdminUserTab = 'resumo';
  selectedCommunityId: number | null = null;
  context: AdminUserCommunityContext | null = null;
  discordMember: AdminDiscordMemberState | null = null;
  contextLoading = false;
  contextError = '';
  discordMemberError = '';
  moderationTypeFilter: ModerationTypeFilter = 'all';
  profile: AdminUserProfile | null = null;
  identity: AdminUserIdentity | null = null;
  identityHistory: AdminIdentityModerationHistory | null = null;
  reliability: AdminUserReliability | null = null;
  loading = true;
  moderationLoading = false;
  moderationError = '';
  errorMessage = '';
  reliabilityError = '';
  identityLoadError = '';
  identityHistoryError = '';
  identityMessage = '';
  linkTargetId: number | null = null;
  linkSearchTerm = '';
  linkSearchResults: AdminUserItem[] = [];
  linkSearchTotal = 0;
  linkSearchLoading = false;
  linkSearchPerformed = false;
  linkSearchError = '';
  private linkSearchGeneration = 0;
  linkStatus: UserIdentityLinkStatus = 'CONFIRMED';
  linkReason = '';
  linkConfirmed = false;
  linkPreview: IdentityUserSummary | null = null;
  linkPreviewModalOpen = false;
  linkConfirmModalOpen = false;
  discordLinkId = '';
  discordPreview: AdminDiscordIdentityPreview | null = null;
  discordPreviewModalOpen = false;
  discordConfirmModalOpen = false;
  discordLinkReason = '';
  discordLinkError = '';
  identityActionLoading = false;
  selectedRole: AdminUserRole = 'member';
  roleConfirmed = false;
  roleActionLoading = false;
  roleMessage = '';
  roleMessageIsError = false;

  readonly roles: { value: AdminUserRole; label: string }[] = [
    { value: 'member', label: 'Membro' },
    { value: 'supporter', label: 'Apoiador' },
    { value: 'moderator', label: 'Moderador' },
    { value: 'admin', label: 'Administrador' }
  ];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private adminService: AdminService,
    private permissions: UserPermissionsService
  ) {}

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!Number.isInteger(id) || id < 1) {
      this.errorMessage = 'Usuário inválido.';
      this.loading = false;
      return;
    }
    this.userId = id;
    this.load(id);
  }

  load(id = this.profile?.identity.id ?? this.userId, page = this.profile?.moderation.pagination.page ?? 1): void {
    if (!id) return;
    this.loading = true;
    this.errorMessage = '';
    this.reliabilityError = '';
    this.identityLoadError = '';
    this.identityHistoryError = '';
    this.identityHistory = null;
    forkJoin({
      profile: this.adminService.getUserProfile(id, page),
      identity: this.adminService.getUserIdentity(id).pipe(
        catchError(() => {
          this.identityLoadError = 'Não foi possível carregar identidades relacionadas.';
          return of(null);
        })
      ),
      reliability: this.adminService.getUserReliability(id).pipe(
        catchError(() => {
          this.reliabilityError = 'Não foi possível carregar confiabilidade e participação em eventos.';
          return of(null);
        })
      )
    }).subscribe({
      next: ({ profile, identity, reliability }) => {
        this.profile = profile;
        this.identity = identity;
        this.reliability = reliability;
        this.selectedRole = profile.identity.role;
        this.loading = false;
        if (this.selectedCommunityId) {
          this.loadIdentityModerationHistory();
        }
      },
      error: (error) => {
        this.errorMessage = error?.status === 404 ? 'Usuário não encontrado.' : 'Não foi possível carregar a ficha administrativa.';
        this.loading = false;
      }
    });
  }

  loadModerationPage(page: number): void {
    const currentProfile = this.profile;
    const id = currentProfile?.identity.id;
    if (!id || page < 1 || page > currentProfile.moderation.pagination.totalPages) return;
    this.moderationLoading = true;
    this.moderationError = '';
    this.adminService.getUserProfile(id, page).subscribe({
      next: profile => {
        this.profile = profile;
        this.selectedRole = profile.identity.role;
        this.moderationLoading = false;
      },
      error: () => {
        this.moderationError = 'Não foi possível carregar esta página do histórico.';
        this.moderationLoading = false;
      }
    });
  }

  selectTab(tab: AdminUserTab): void {
    const definition = this.tabs.find(item => item.id === tab);
    if (!definition || (definition.local && !this.selectedCommunityId)) return;
    this.activeTab = tab;
    if (definition.local && !this.context && !this.contextLoading) this.loadContext();
  }

  get activeTabIsLocal(): boolean {
    return this.tabs.find(item => item.id === this.activeTab)?.local ?? false;
  }

  get communityOptions(): AdminUserProfile['communities'] {
    const unique = new Map<number, AdminUserProfile['communities'][number]>();
    this.profile?.communities.forEach(community => {
      if (!unique.has(community.id)) unique.set(community.id, community);
    });
    return [...unique.values()];
  }

  selectCommunity(value: number | string | null): void {
    const parsed = value === null || value === '' || value === 'global' ? null : Number(value);
    this.selectedCommunityId = Number.isInteger(parsed) && Number(parsed) > 0 ? Number(parsed) : null;
    this.context = null;
    this.discordMember = null;
    this.contextLoading = false;
    this.contextError = '';
    this.discordMemberError = '';
    this.identityHistory = null;
    this.identityHistoryError = '';
    if (!this.selectedCommunityId) {
      if (this.tabs.find(item => item.id === this.activeTab)?.local) this.activeTab = 'resumo';
      return;
    }
    this.loadIdentityModerationHistory();
    if (this.tabs.find(item => item.id === this.activeTab)?.local) this.loadContext();
  }

  loadContext(): void {
    if (!this.selectedCommunityId) return;
    const communityId = this.selectedCommunityId;
    this.contextLoading = true;
    this.contextError = '';
    this.discordMemberError = '';
    forkJoin({
      context: this.adminService.getUserCommunityContext(this.userId, communityId).pipe(
        catchError(() => {
          if (this.selectedCommunityId === communityId) {
            this.contextError = 'Não foi possível carregar os dados persistidos desta comunidade.';
          }
          return of(null);
        })
      ),
      discord: this.adminService.getUserDiscordMember(this.userId, communityId).pipe(
        catchError(error => {
          if (this.selectedCommunityId === communityId) {
            this.discordMemberError = error?.status === 404
              ? 'O membro não está disponível no cache atual do Discord.'
              : error?.status === 409
                ? 'Há múltiplos vínculos Discord legados; nenhum foi escolhido para consulta ao vivo.'
                : 'O estado ao vivo do Discord está indisponível.';
          }
          return of(null);
        })
      )
    }).subscribe(({ context, discord }) => {
      if (this.selectedCommunityId !== communityId) return;
      this.context = context;
      this.discordMember = discord;
      this.contextLoading = false;
    });
  }

  setModerationType(type: ModerationTypeFilter): void { this.moderationTypeFilter = type; }

  goBack(): void { this.router.navigate(['../'], { relativeTo: this.route }); }

  get canManageLinks(): boolean { return this.permissions.isAdmin(); }

  onRoleChange(): void {
    this.roleConfirmed = false;
    this.roleMessage = '';
    this.roleMessageIsError = false;
  }

  updateRole(): void {
    if (!this.profile || !this.canManageLinks || this.selectedRole === this.profile.identity.role) return;
    if (!this.roleConfirmed) {
      this.roleMessage = 'Confirme que você revisou a alteração de cargo.';
      this.roleMessageIsError = true;
      return;
    }

    const userId = this.profile.identity.id;
    const currentPage = this.profile.moderation.pagination.page;
    const targetRole = this.selectedRole;
    if (!window.confirm(`Alterar o cargo do User #${userId} para ${this.roleLabel(targetRole)}?`)) return;

    this.roleActionLoading = true;
    this.roleMessage = '';
    this.roleMessageIsError = false;
    this.adminService.updateUserRole(userId, targetRole).subscribe({
      next: updated => {
        this.roleMessage = `Cargo atualizado para ${this.roleLabel(updated.role)}.`;
        this.roleConfirmed = false;
        this.roleActionLoading = false;
        this.load(userId, currentPage);
      },
      error: error => {
        this.selectedRole = this.profile?.identity.role ?? 'member';
        this.roleMessage = error?.status === 403
          ? 'Você não possui autorização para alterar este cargo.'
          : error?.status === 404
            ? 'Usuário não encontrado.'
            : 'Não foi possível alterar o cargo.';
        this.roleMessageIsError = true;
        this.roleActionLoading = false;
      }
    });
  }


  onLinkSearchTermChange(): void {
    // Invalidate responses from earlier searches when the user edits the query.
    this.linkSearchGeneration++;
    this.linkSearchResults = [];
    this.linkSearchTotal = 0;
    this.linkSearchLoading = false;
    this.linkSearchPerformed = false;
    this.linkSearchError = '';
  }

  searchLinkTargets(): void {
    if (!this.canManageLinks) return;
    const search = this.linkSearchTerm.trim();
    this.onLinkSearchTermChange();
    if (search.length < 2) {
      this.linkSearchError = 'Digite pelo menos 2 caracteres ou um Discord User ID.';
      return;
    }

    const generation = ++this.linkSearchGeneration;
    const sourceUserId = this.userId;
    this.linkSearchLoading = true;
    this.adminService.getUsers({ page: 1, pageSize: 20, search }).subscribe({
      next: response => {
        if (
          generation !== this.linkSearchGeneration
          || sourceUserId !== this.userId
          || search !== this.linkSearchTerm.trim()
        ) return;
        this.linkSearchResults = response.items.filter(candidate => candidate.id !== sourceUserId);
        this.linkSearchTotal = response.pagination.totalItems;
        this.linkSearchLoading = false;
        this.linkSearchPerformed = true;
      },
      error: () => {
        if (generation !== this.linkSearchGeneration || sourceUserId !== this.userId) return;
        this.linkSearchLoading = false;
        this.linkSearchError = 'Não foi possível pesquisar as contas cadastradas.';
      }
    });
  }

  isAlreadyLinkedCandidate(candidateId: number): boolean {
    return candidateId === this.userId
      || this.identity?.confirmedAccounts.some(account => account.userId === candidateId) === true;
  }

  selectLinkSearchResult(candidate: AdminUserItem): void {
    if (!this.canManageLinks || this.isAlreadyLinkedCandidate(candidate.id)) return;
    this.linkTargetId = candidate.id;
    this.onLinkTargetIdChange();
    this.previewLinkTarget();
  }

  onLinkTargetIdChange(): void {
    this.linkPreview = null;
    this.linkConfirmed = false;
    this.linkPreviewModalOpen = false;
    this.linkConfirmModalOpen = false;
    this.linkReason = '';
    this.identityMessage = '';
  }

  previewLinkTarget(): void {
    this.identityMessage = '';
    this.linkPreview = null;
    if (!this.linkTargetId || this.linkTargetId < 1) {
      this.identityMessage = 'Informe um User ID válido.';
      return;
    }

    const requestedId = this.linkTargetId;
    this.adminService.getUserIdentity(requestedId).subscribe({
      next: identity => {
        if (this.linkTargetId !== requestedId) return;
        this.linkPreview = identity.confirmedAccounts.find(account => account.userId === requestedId) ?? null;
        if (!this.linkPreview) {
          this.identityMessage = 'A conta relacionada não pôde ser carregada.';
          return;
        }
        this.linkPreviewModalOpen = true;
        this.linkConfirmModalOpen = false;
      },
      error: error => {
        if (this.linkTargetId !== requestedId) return;
        this.identityMessage = this.identityError(error?.status);
      }
    });
  }

  onDiscordLinkIdChange(): void {
    this.discordPreview = null;
    this.discordPreviewModalOpen = false;
    this.discordConfirmModalOpen = false;
    this.discordLinkReason = '';
    this.discordLinkError = '';
  }

  previewDiscordIdentity(): void {
    const discordUserId = this.discordLinkId.trim();
    if (!/^\d{1,20}$/.test(discordUserId)) {
      this.discordLinkError = 'Informe um Discord User ID válido.';
      return;
    }

    this.discordLinkError = '';
    this.identityActionLoading = true;
    this.adminService.previewDiscordIdentity(this.userId, discordUserId).subscribe({
      next: preview => {
        this.discordPreview = preview;
        this.discordPreviewModalOpen = true;
        this.discordConfirmModalOpen = false;
        this.identityActionLoading = false;
      },
      error: error => {
        this.discordLinkError = error?.status === 404
          ? 'Usuário Discord não encontrado.'
          : error?.status === 503
            ? 'Não foi possível consultar o Discord pelo Coddy agora.'
            : 'Não foi possível consultar esta conta Discord.';
        this.identityActionLoading = false;
      }
    });
  }

  continueDiscordIdentityLink(): void {
    if (!this.discordPreview || this.discordPreview.alreadyInConfirmedCluster) return;
    this.discordPreviewModalOpen = false;
    this.discordConfirmModalOpen = true;
    this.discordLinkError = '';
  }

  closeDiscordIdentityModals(): void {
    if (this.identityActionLoading) return;
    this.discordPreviewModalOpen = false;
    this.discordConfirmModalOpen = false;
  }

  confirmDiscordIdentityLink(): void {
    const preview = this.discordPreview;
    const reason = this.discordLinkReason.trim();
    if (!preview || !reason) {
      this.discordLinkError = 'Informe o motivo administrativo antes de confirmar.';
      return;
    }

    this.identityActionLoading = true;
    this.discordLinkError = '';
    this.adminService.linkDiscordIdentity(
      this.userId,
      preview.discordUserId,
      reason
    ).subscribe({
      next: result => {
        this.identityMessage = result.createdUser
          ? `Novo User #${result.targetUserId} criado a partir do Discord e vinculado ao cluster confirmado.`
          : `User #${result.targetUserId} vinculado ao cluster confirmado.`;
        this.discordPreviewModalOpen = false;
        this.discordConfirmModalOpen = false;
        this.discordLinkId = '';
        this.discordPreview = null;
        this.discordLinkReason = '';
        this.identityActionLoading = false;
        this.reloadIdentity();
      },
      error: error => {
        this.discordLinkError = error?.status === 409
          ? 'A identidade mudou desde o preview ou este vínculo já existe. Atualize e tente novamente.'
          : error?.status === 404
            ? 'A conta Discord não pôde mais ser localizada.'
            : error?.status === 503
              ? 'O Coddy não conseguiu confirmar a conta Discord agora.'
              : 'Não foi possível concluir o vínculo Discord.';
        this.identityActionLoading = false;
      }
    });
  }

  existingLinkAlreadyConfirmed(): boolean {
    return !!this.linkPreview
      && !!this.identity?.confirmedAccounts.some(account => account.userId === this.linkPreview?.userId);
  }

  continueExistingIdentityLink(): void {
    if (!this.linkPreview || !this.linkTargetId) return;
    if (this.existingLinkAlreadyConfirmed()) {
      this.identityMessage = 'Este User já pertence ao cluster confirmado desta ficha.';
      this.linkPreviewModalOpen = false;
      return;
    }
    this.linkPreviewModalOpen = false;
    this.linkConfirmModalOpen = true;
    this.linkConfirmed = true;
    this.identityMessage = '';
  }

  closeExistingIdentityModals(): void {
    if (this.identityActionLoading) return;
    this.linkPreviewModalOpen = false;
    this.linkConfirmModalOpen = false;
  }

  createLink(): void {
    if (
      !this.identity ||
      !this.linkTargetId ||
      !this.linkPreview ||
      this.linkPreview.userId !== this.linkTargetId
    ) {
      this.identityMessage = 'Confira a conta relacionada antes de continuar.';
      return;
    }
    if (!this.linkReason.trim()) {
      this.identityMessage = 'O motivo é obrigatório.';
      return;
    }
    if (!this.linkConfirmModalOpen || !this.linkConfirmed) {
      this.identityMessage = 'Conclua as duas etapas de confirmação antes de vincular.';
      return;
    }
    this.identityActionLoading = true;
    this.adminService.createUserIdentityLink(
      this.identity.requestedUserId, this.linkTargetId, this.linkStatus, this.linkReason.trim()
    ).subscribe({
      next: () => {
        this.identityMessage = 'Vínculo de identidade registrado.';
        this.linkPreviewModalOpen = false;
        this.linkConfirmModalOpen = false;
        this.resetLinkForm();
        this.reloadIdentity();
      },
      error: error => {
        this.identityMessage = this.identityError(error?.status);
        this.identityActionLoading = false;
      }
    });
  }

  confirmLink(link: UserIdentityLinkView): void {
    const reason = window.prompt('Informe o motivo da confirmação deste vínculo:')?.trim();
    if (!reason || !this.identity) return;
    this.identityActionLoading = true;
    this.adminService.updateUserIdentityLink(link.userA.userId, link.userB.userId, 'CONFIRMED', reason).subscribe({
      next: () => { this.identityMessage = 'Vínculo confirmado.'; this.reloadIdentity(); },
      error: error => { this.identityMessage = this.identityError(error?.status); this.identityActionLoading = false; }
    });
  }

  revokeLink(link: UserIdentityLinkView): void {
    const reason = window.prompt('Informe o motivo da revogação deste vínculo:')?.trim();
    if (!reason || !this.identity || !window.confirm('Revogar este vínculo de identidade? O histórico permanecerá auditável.')) return;
    this.identityActionLoading = true;
    this.adminService.revokeUserIdentityLink(link.userA.userId, link.userB.userId, reason).subscribe({
      next: () => { this.identityMessage = 'Vínculo revogado.'; this.reloadIdentity(); },
      error: error => { this.identityMessage = this.identityError(error?.status); this.identityActionLoading = false; }
    });
  }

  sourceUsers(): IdentityUserSummary[] {
    return this.identity?.confirmedAccounts ?? [];
  }

  linkLabel(link: UserIdentityLinkView): string {
    return `User #${link.userA.userId} ↔ User #${link.userB.userId}`;
  }

  confirmedAccountFor(userId: number): IdentityUserSummary {
    return this.identity?.confirmedAccounts.find(account => account.userId === userId) ?? {
      userId,
      discordAccounts: []
    };
  }

  warningsFor(userId: number): IdentityWarningHistory[] {
    if (this.moderationTypeFilter === 'ban' || this.moderationTypeFilter === 'note') return [];
    return this.identityHistory?.warnings.filter(item => item.sourceUserId === userId) ?? [];
  }
  bansFor(userId: number): IdentityBanHistory[] {
    if (this.moderationTypeFilter === 'warn' || this.moderationTypeFilter === 'note') return [];
    return this.identityHistory?.bans.filter(item => item.sourceUserId === userId) ?? [];
  }
  notesFor(userId: number): IdentityNoteHistory[] {
    if (this.moderationTypeFilter === 'warn' || this.moderationTypeFilter === 'ban') return [];
    return this.identityHistory?.notes.filter(item => item.sourceUserId === userId) ?? [];
  }

  booleanLabel(value?: boolean | null): string {
    return value === true ? 'Sim' : value === false ? 'Não' : 'Não verificado';
  }

  discordLabel(user: IdentityUserSummary): string {
    return user.discordAccounts.length
      ? user.discordAccounts.map(account => `${account.displayName || account.username} (${account.discordUserId})`).join(', ')
      : 'Sem Discord cadastrado';
  }

  roleLabel(role: AdminUserRole): string {
    return this.roles.find(option => option.value === role)?.label ?? role;
  }

  statusLabel(status: AdminUserProfile['identity']['status']): string {
    return status === 'banned' ? 'Ban ativo em comunidade' : status === 'muted' ? 'Restrição ativa' : 'Conta ativa';
  }

  approvedMembershipsLabel(): string {
    return this.reliability
      ? `${this.reliability.communities.approvedMemberships} aprovadas`
      : 'Dados de aprovação indisponíveis';
  }

  telegramLinkStatusLabel(): string {
    if (this.reliability) {
      if (this.reliability.account.telegramAmbiguous) return 'Múltiplos vínculos legados';
      return this.reliability.account.linkedTelegram
        ? 'Conta externa vinculada'
        : 'Sem vínculo confirmado';
    }
    if (this.profile?.identity.telegramAmbiguous) return 'Múltiplos vínculos legados';
    return this.profile?.identity.telegramUsername
      ? 'Telegram cadastrado'
      : 'Status do vínculo indisponível';
  }

  reliabilityLevelLabel(level: string): string {
    return ({ alta: 'Alta', media: 'Média', baixa: 'Baixa', critica: 'Crítica' } as Record<string, string>)[level] ?? level;
  }

  reliabilitySignalLabel(signal: string): string {
    return ({
      possui_banimento_ativo: 'Possui banimento ativo',
      muitos_warns_ativos: 'Possui vários warns ativos',
      warns_em_multiplos_servidores: 'Warns em múltiplas comunidades',
      ja_gerenciou_eventos_aprovados: 'Já gerenciou eventos aprovados',
      atua_como_staff_em_eventos: 'Atua como staff em eventos',
      membro_partner_em_servidor: 'É partner em uma comunidade',
      discord_nao_vinculado: 'Discord não vinculado'
    } as Record<string, string>)[signal] ?? signal.replaceAll('_', ' ');
  }

  private reloadIdentity(): void {
    const id = this.profile?.identity.id;
    if (!id) return;
    forkJoin({
      identity: this.adminService.getUserIdentity(id),
      history: this.selectedCommunityId
        ? this.adminService.getUserIdentityModerationHistory(id, this.selectedCommunityId)
        : of(null)
    }).subscribe({
      next: ({ identity, history }) => {
        this.identity = identity;
        this.identityHistory = history;
        this.identityActionLoading = false;
      },
      error: error => { this.identityMessage = this.identityError(error?.status); this.identityActionLoading = false; }
    });
  }

  private loadIdentityModerationHistory(): void {
    const id = this.profile?.identity.id;
    const communityId = this.selectedCommunityId;
    if (!id || !communityId) return;

    this.identityHistory = null;
    this.identityHistoryError = '';
    this.adminService.getUserIdentityModerationHistory(id, communityId).pipe(
      catchError(() => {
        if (this.selectedCommunityId === communityId) {
          this.identityHistoryError = 'Não foi possível carregar o histórico confirmado desta comunidade.';
        }
        return of(null);
      })
    ).subscribe(history => {
      if (this.selectedCommunityId === communityId) this.identityHistory = history;
    });
  }

  private resetLinkForm(): void {
    this.linkTargetId = null;
    this.linkStatus = 'CONFIRMED';
    this.linkReason = '';
    this.linkConfirmed = false;
    this.linkPreview = null;
  }

  private identityError(status: number): string {
    if (status === 400) return 'Revise os dados e o motivo informado.';
    if (status === 404) return 'Uma das contas não foi encontrada.';
    if (status === 409) return 'Já existe um vínculo ativo entre as contas ou ele foi alterado.';
    return 'Não foi possível atualizar a identidade vinculada.';
  }

  formatDate(value?: string | null): string {
    if (!value) return 'Não disponível';
    const civilDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (civilDate) return `${civilDate[3]}/${civilDate[2]}/${civilDate[1]}`;
    return new Intl.DateTimeFormat('pt-BR').format(new Date(value));
  }

  presenceLabel(value?: boolean | null): string {
    return value === true ? 'Presente' : value === false ? 'Não está mais nesta comunidade' : 'Presença ainda não verificada';
  }

  banStatusLabel(value: 'active' | 'expired' | 'revoked'): string {
    return value === 'active' ? 'Ativo' : value === 'expired' ? 'Expirado' : 'Revogado';
  }
}
