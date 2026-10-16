import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { concatMap, forkJoin, Observable, of, Subscription } from 'rxjs';
import { AutoJoinRolesState, BumpConfigResponse, BumpMonthlyRankingConfig, BumpWarningRequest, CollaborativeModerationConfig, GuildChannel, GuildOperationRequest, GuildOperationResult, GuildResources, GuildRole, LogConfiguration, LogsState, ManagedServer, ManagedServersService, ModerationAccessState, PermissionChange, PortariaBypass, PortariaBypassCreateRequest, PortariaConfig, PortariaFlow, PortariaPublicationRequest, PortariaRoleIds, PortariaState, PreviewSubjectRef, ServerChannelsConfig, StaffRoles, StructurePreview } from '../../../core/services/managed-servers.service';
import { CommunityContextService, CommunityContextState } from '../../../core/services/community-context.service';

type ServerSection = 'overview' | 'vip' | 'channels' | 'ai' | 'bump' | 'portaria' | 'moderation-access' | 'backups' | 'themes' | 'cargos-automaticos' | 'private-area' | 'logs' | 'leveling' | 'economy' | 'tickets';
type SaveState = 'idle' | 'saving' | 'saved' | 'error';
type BumpCard = 'processing' | 'warning' | 'individual' | 'monthly';
interface ServerSectionLink { id: ServerSection; label: string; icon: string; status?: 'coming-soon'; }
interface LogDraft { enabled: boolean; targetId: string | null; saving: boolean; testing: boolean; error: string; }
interface PortariaWizardDraft { newFlowName: string; newFlowTargetChannelId: string; isolateVisitors: boolean; visitorRoleName: string; portariaCategoryName: string; portariaStaffRoleIds: string[]; portariaCreationMode: 'template' | 'manual'; createApproved: boolean; createRejected: boolean; manualVisitorRoleId: string; manualWelcomeChannelId: string; manualTargetChannelId: string; manualApprovedChannelId?: string; manualRejectedChannelId?: string; }
interface PrivateAreaDraft { privateCategoryName: string; privateChannelNames: string; privateAllowedRoleIds: string[]; }
interface PortariaBypassDraft { type: 'invite' | 'account'; value: string; accessMode: 'provisorio' | 'completo'; requiresForm: boolean; active: boolean; expiresAt: string; }
type PendingNavigation = { kind: 'route'; guildId: string; section: ServerSection } | { kind: 'flow'; flowId: number };
const LOG_DISPLAY_ORDER = ['profile', 'message_edit', 'message_delete', 'call', 'mute', 'warn', 'ban'];

@Component({ selector: 'app-servidores', standalone: false, templateUrl: './servidores.component.html', styleUrl: './servidores.component.scss' })
export class ServidoresComponent implements OnInit, OnDestroy {
  servers: ManagedServer[] = [];
  readonly sections: ServerSectionLink[] = [
    { id: 'overview', label: 'Visão geral', icon: '✨' }, { id: 'vip', label: 'VIP', icon: '💎' }, { id: 'channels', label: 'Canais', icon: '#️⃣' }, { id: 'ai', label: 'IA', icon: '🤖' }, { id: 'bump', label: 'Bump', icon: '🚀' },
    { id: 'portaria', label: 'Portaria', icon: '🚪' }, { id: 'moderation-access', label: 'Moderação & Acesso', icon: '🛡️' }, { id: 'backups', label: 'Backups', icon: '💾' }, { id: 'themes', label: 'Temas', icon: '🎨' }, { id: 'cargos-automaticos', label: 'Cargos automáticos', icon: '⚙️' }, { id: 'private-area', label: 'Área privada', icon: '🔐' },
    { id: 'logs', label: 'Logs', icon: '📜' }, { id: 'leveling', label: 'XP & Leveling', icon: '🏆' },
    { id: 'economy', label: 'Economia', icon: '💰', status: 'coming-soon' }, { id: 'tickets', label: 'Tickets', icon: '🎫', status: 'coming-soon' }
  ];
  selectedServerId = '';
  activeSection: ServerSection = 'overview';
  isLoading = true;
  loadError = false;
  invalidGuild = false;
  private readonly failedServerIcons = new Set<string>();
  configurationLoading = false;
  configurationError = '';
  resources?: GuildResources;
  staff?: StaffRoles;
  moderationAccess?: ModerationAccessState;
  collaborativeDraft?: CollaborativeModerationConfig;
  private collaborativeBaseline?: string;
  portariaBypasses: PortariaBypass[] = [];
  bypassPortariaEnabled = true;
  bypassesLoading = false;
  bypassesError = '';
  private bypassRequestGeneration = 0;
  bypassDraft: PortariaBypassDraft = this.emptyBypassDraft();
  private bypassDraftBaseline = JSON.stringify(this.emptyBypassDraft());
  portaria?: PortariaState;
  autoJoinRoles?: AutoJoinRolesState;
  serverChannels?: ServerChannelsConfig;
  logs?: LogsState;
  logDrafts: Record<string, LogDraft> = {};
  logsError = '';
  xpDirty = false;
  xpSaving = false;
  aiDirty = false;
  aiSaving = false;
  vipDirty = false;
  vipSaving = false;
  backupDirty = false;
  backupSaving = false;
  themeDirty = false;
  themeSaving = false;
  private logsRequestGeneration = 0;
  autoJoinRoleId = '';
  staffRoleDraft: string[] = [];
  portariaRoleDraft: PortariaRoleIds = { visitanteRoleId: null, acessoProvisorioRoleId: null, maior18RoleId: null, menor18RoleId: null };
  birthdayChannelId: string | null = null;
  bumpPersisted?: BumpConfigResponse;
  bumpDraft?: BumpConfigResponse;
  bumpSaveState: Record<BumpCard, SaveState> = { processing: 'idle', warning: 'idle', individual: 'idle', monthly: 'idle' };
  bumpSaveError: Partial<Record<BumpCard, string>> = {};
  visitorAutoJoinCleanupRoleId?: string;
  saveState: SaveState = 'idle';
  saveError = '';
  newFlowName = 'Portaria';
  newFlowTargetChannelId = '';
  isolateVisitors = false;
  visitorRoleName = 'Visitante';
  portariaCategoryName = 'Portaria';
  privateCategoryName = 'Staff';
  privateChannelNames = 'staff, avisos-staff, logs';
  privateAllowedRoleIds: string[] = [];
  portariaStaffRoleIds: string[] = [];
  portariaCreationMode: 'template' | 'manual' = 'template';
  createApproved = true;
  createRejected = true;
  manualVisitorRoleId = '';
  manualWelcomeChannelId = '';
  manualTargetChannelId = '';
  manualApprovedChannelId?: string;
  manualRejectedChannelId?: string;
  publicationChannelId = '';
  publicationCustomizeMessage = false;
  publicationMessage = '';
  publicationCustomizeButton = false;
  publicationButtonText = 'Abrir formulário';
  mutationInFlight = false;
  pendingConfirmation?: { title: string; summary: string; request: GuildOperationRequest; deleteFlowId?: number };
  operationResult?: GuildOperationResult;
  operationModal?: { state: 'success' | 'error' | 'cancelled'; title: string; message: string; details: string[] };
  private lastSave?: () => void;
  private portariaBaseline?: PortariaState;
  private portariaWizardBaseline?: PortariaWizardDraft;
  private privateAreaBaseline?: PrivateAreaDraft;
  private channelsBaseline?: string;
  private publicationDraftBaseline?: string;
  pendingNavigation?: PendingNavigation;

  private routeSubscription?: Subscription;
  private contextSubscription?: Subscription;
  private activeCommunityId: number | null = null;

  constructor(
    private readonly managedServersService: ManagedServersService,
    private readonly communityContext: CommunityContextService,
    private readonly route: ActivatedRoute,
    private readonly router: Router
  ) {}

  ngOnInit(): void {
    this.routeSubscription = this.route.paramMap.subscribe(() => this.resolveRoute());
    this.contextSubscription = this.communityContext.state$.subscribe(state => this.applyCommunityContext(state));
  }

  ngOnDestroy(): void {
    this.routeSubscription?.unsubscribe();
    this.contextSubscription?.unsubscribe();
  }
  get selectedServer(): ManagedServer | undefined { return this.servers.find(server => server.guildId === this.selectedServerId); }
  get activeSectionDetails(): ServerSectionLink | undefined { return this.sections.find(section => section.id === this.activeSection); }
  get selectedFlow(): PortariaFlow | undefined { return this.portaria?.selectedFlow; }
  get orderedLogs(): LogConfiguration[] {
    const order = new Map(LOG_DISPLAY_ORDER.map((type, index) => [type, index]));
    return [...(this.logs?.logs ?? [])].sort((first, second) => (order.get(first.type) ?? LOG_DISPLAY_ORDER.length) - (order.get(second.type) ?? LOG_DISPLAY_ORDER.length));
  }

  loadManagedServers(): void {
    const communityId = this.communityContext.snapshot.activeCommunity?.communityId;
    if (communityId == null) return;

    this.isLoading = true;
    this.loadError = false;
    this.communityContext.resolveCommunity(communityId, true).subscribe(result => {
      if (result.kind === 'error' || !result.state.managedServersAvailable) {
        this.servers = [];
        this.selectedServerId = '';
        this.loadError = true;
        this.isLoading = false;
        return;
      }
      this.applyCommunityContext(result.state);
    });
  }

  private applyCommunityContext(state: CommunityContextState): void {
    if (state.status === 'loading') {
      this.isLoading = true;
      return;
    }

    const communityId = state.activeCommunity?.communityId ?? null;
    if (state.status !== 'ready' || communityId === null) return;

    const serverIds = state.managedDiscordServers.map(server => server.guildId).join(',');
    const currentIds = this.servers.map(server => server.guildId).join(',');
    const changedCommunity = this.activeCommunityId !== communityId;
    const changedServers = serverIds !== currentIds;

    this.activeCommunityId = communityId;
    this.servers = state.managedDiscordServers;
    this.loadError = !state.managedServersAvailable;
    this.isLoading = false;

    if (changedCommunity || changedServers) {
      if (changedCommunity) {
        this.selectedServerId = '';
        this.invalidGuild = false;
        this.clearConfiguration();
      }
      this.resolveRoute();
    }
  }
  loadConfiguration(flowId?: number): void {
    if (!this.selectedServerId) return;
    const guildId = this.selectedServerId;
    this.configurationLoading = true; this.configurationError = ''; this.channelsBaseline = undefined; this.resetPublicationDraft(); this.saveState = 'idle';
    forkJoin({ resources: this.managedServersService.getResources(guildId), moderationAccess: this.managedServersService.getModerationAccess(guildId), portaria: this.managedServersService.getPortaria(guildId, flowId), autoJoinRoles: this.managedServersService.getAutoJoinRoles(guildId), serverChannels: this.managedServersService.getServerChannels(guildId), bump: this.managedServersService.getBump(guildId) }).subscribe({
      next: value => { if (guildId !== this.selectedServerId) return; this.resources = value.resources; this.applyModerationAccess(value.moderationAccess); this.applyPersistedPortariaState(value.portaria); this.autoJoinRoles = value.autoJoinRoles; this.applyServerChannels(value.serverChannels); this.applyBump(value.bump); this.staffRoleDraft = [...value.moderationAccess.staffRoles.roleIds]; this.portariaRoleDraft = this.portariaRoleIds(value.portaria.config); this.privateAllowedRoleIds = [...value.moderationAccess.staffRoles.roleIds]; this.portariaStaffRoleIds = [...value.moderationAccess.staffRoles.roleIds]; this.newFlowTargetChannelId = this.textChannels[0]?.id ?? ''; this.manualVisitorRoleId = this.orderedRoles[0]?.id ?? ''; this.manualWelcomeChannelId = this.textChannels[0]?.id ?? ''; this.manualTargetChannelId = this.textChannels[0]?.id ?? ''; this.resetPublicationDraft(); this.captureDraftBaselines(); this.configurationLoading = false; },
      error: error => { if (guildId !== this.selectedServerId) return; this.channelsBaseline = undefined; this.configurationError = error?.error?.message || 'Não foi possível carregar a configuração deste servidor.'; this.configurationLoading = false; }
    });
  }
  selectServer(event: Event): void {
    const select = event.target as HTMLSelectElement;
    this.requestNavigation(select.value, this.activeSection);
    if (this.pendingNavigation) select.value = this.selectedServerId;
  }
  selectSection(section: ServerSection): void { this.requestNavigation(this.selectedServerId, section); }

  private applyModerationAccess(value: ModerationAccessState): void {
    this.moderationAccess = structuredClone(value);
    this.staff = structuredClone(value.staffRoles);
    this.collaborativeDraft = structuredClone(value.collaborativeModeration);
    this.collaborativeBaseline = JSON.stringify(value.collaborativeModeration);
  }

  loadPortariaBypasses(): void {
    const guildId = this.selectedServerId;
    if (!guildId) return;
    const generation = ++this.bypassRequestGeneration;
    this.bypassesLoading = true;
    this.bypassesError = '';
    this.managedServersService.getPortariaBypasses(guildId).subscribe({
      next: state => {
        if (guildId !== this.selectedServerId || generation !== this.bypassRequestGeneration) return;
        this.bypassPortariaEnabled = state.portariaEnabled;
        this.portariaBypasses = state.bypasses;
        this.bypassesLoading = false;
      },
      error: error => {
        if (guildId !== this.selectedServerId || generation !== this.bypassRequestGeneration) return;
        this.bypassesLoading = false;
        this.bypassesError = error?.error?.message || 'Não foi possível carregar os bypasses da Portaria.';
      }
    });
  }

  saveCollaborativeModeration(): void {
    const draft = this.collaborativeDraft;
    if (!draft || !this.collaborativeDirty) return;
    const submitted = {
      enabled: draft.enabled,
      emoji: draft.emoji?.trim() || null,
      minReactions: Math.max(1, Number(draft.minReactions || 1))
    };
    this.save(
      () => this.managedServersService.updateCollaborativeModeration(this.selectedServerId, submitted),
      value => {
        this.moderationAccess = structuredClone(value);
        this.staff = structuredClone(value.staffRoles);
        this.collaborativeDraft = structuredClone(value.collaborativeModeration);
        this.collaborativeBaseline = JSON.stringify(value.collaborativeModeration);
      }
    );
  }

  createPortariaBypass(): void {
    const target = this.bypassDraft.value.trim();
    if (!target) return;
    const request: PortariaBypassCreateRequest = {
      type: this.bypassDraft.type,
      value: target,
      active: this.bypassDraft.active,
      expiresAt: this.bypassDraft.expiresAt ? new Date(this.bypassDraft.expiresAt).toISOString() : null
    };
    if (this.bypassDraft.type === 'account') {
      request.accessMode = this.bypassDraft.accessMode;
      request.requiresForm = this.bypassDraft.requiresForm;
    }
    this.invalidateBypassLoad();
    this.save(
      () => this.managedServersService.createPortariaBypass(this.selectedServerId, request),
      value => {
        this.portariaBypasses = [value, ...this.portariaBypasses.filter(item => !this.sameBypass(item, value))];
        this.resetBypassDraft();
      }
    );
  }

  togglePortariaBypass(bypass: PortariaBypass): void {
    this.invalidateBypassLoad();
    this.save(
      () => this.managedServersService.updatePortariaBypass(this.selectedServerId, bypass, { active: !bypass.active }),
      value => this.replacePortariaBypass(value)
    );
  }

  removePortariaBypass(bypass: PortariaBypass): void {
    this.invalidateBypassLoad();
    this.save(
      () => this.managedServersService.removePortariaBypass(this.selectedServerId, bypass),
      () => { this.portariaBypasses = this.portariaBypasses.filter(item => !this.sameBypass(item, bypass)); }
    );
  }

  private replacePortariaBypass(value: PortariaBypass): void {
    this.portariaBypasses = this.portariaBypasses.map(item => this.sameBypass(item, value) ? value : item);
  }

  sameBypass(first: Pick<PortariaBypass, 'type' | 'id'>, second: Pick<PortariaBypass, 'type' | 'id'>): boolean {
    return first.type === second.type && first.id === second.id;
  }

  private invalidateBypassLoad(): void {
    this.bypassRequestGeneration++;
    this.bypassesLoading = false;
  }

  private emptyBypassDraft(): PortariaBypassDraft {
    return { type: 'invite', value: '', accessMode: 'completo', requiresForm: false, active: true, expiresAt: '' };
  }

  resetBypassDraft(): void {
    this.bypassDraft = this.emptyBypassDraft();
    this.bypassDraftBaseline = JSON.stringify(this.bypassDraft);
  }

  formatBypassExpiration(value: string | null): string {
    if (!value) return 'Sem expiração';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
  }
  loadLogs(): void { const guildId = this.selectedServerId; if (!guildId) return; const generation = ++this.logsRequestGeneration; this.logsError = ''; this.managedServersService.getLogs(guildId).subscribe({ next: logs => { if (guildId !== this.selectedServerId || generation !== this.logsRequestGeneration) return; this.reconcileLogs(logs); }, error: error => { if (guildId === this.selectedServerId && generation === this.logsRequestGeneration) this.logsError = error?.error?.message || 'Não foi possível carregar os logs.'; } }); }
  private reconcileLogs(next: LogsState): void { const previous = this.logs; for (const log of next.logs) { const draft = this.logDrafts[log.type]; const old = previous?.logs.find(item => item.type === log.type); const dirty = !!draft && !!old && (draft.enabled !== old.enabled || draft.targetId !== (old.target?.id ?? null)); if (!draft || !dirty) this.logDrafts[log.type] = { enabled: log.enabled, targetId: log.target?.id ?? null, saving: false, testing: draft?.testing ?? false, error: '' }; } this.logs = next; }
  logOptions(log: LogConfiguration): { id: string; label: string; disabled: boolean }[] {
    const options = (this.logs?.targets ?? []).map(target => ({ id: target.id, label: this.logTargetLabel(target), disabled: false }));
    const persisted = log.target;
    const draftId = this.logDrafts[log.type]?.targetId;
    if (persisted && !options.some(option => option.id === persisted.id)) {
      options.push({ id: persisted.id, label: persisted.missing ? `Destino configurado indisponível — ID ${persisted.id}` : `${this.logTargetLabel(persisted)} — configurado, sem permissão`, disabled: true });
    }
    if (draftId && draftId !== persisted?.id && !options.some(option => option.id === draftId)) {
      options.push({ id: draftId, label: `Destino selecionado indisponível — ID ${draftId}`, disabled: true });
    }
    return options;
  }
  logTargetLabel(target: { type: string | null; name: string | null; parentName: string | null } | null): string {
    if (!target || !target.name) return 'Destino não encontrado';
    return target.type === 'forum_thread' ? `${target.parentName} › ${target.name}` : `# ${target.name}`;
  }
  isLogDirty(log: LogConfiguration): boolean { const draft = this.logDrafts[log.type]; return !!draft && (draft.enabled !== log.enabled || draft.targetId !== (log.target?.id ?? null)); }
  updateLogEnabled(log: LogConfiguration, enabled: boolean): void { this.logDrafts[log.type] = { ...this.logDrafts[log.type], enabled, error: '' }; }
  updateLogTarget(log: LogConfiguration, targetId: string): void { this.logDrafts[log.type] = { ...this.logDrafts[log.type], targetId: targetId || null, error: '' }; }
  saveLog(log: LogConfiguration): void {
    const draft = this.logDrafts[log.type]; if (!draft || draft.saving || (draft.enabled && !draft.targetId)) return;
    const guildId = this.selectedServerId; this.logsRequestGeneration++; draft.saving = true; draft.error = '';
    this.managedServersService.updateLog(guildId, log.type, { enabled: draft.enabled, targetId: draft.targetId }).subscribe({
      next: state => { if (guildId === this.selectedServerId) { this.logs = state; const saved = state.logs.find(item => item.type === log.type); if (saved) this.logDrafts[log.type] = { enabled: saved.enabled, targetId: saved.target?.id ?? null, saving: false, testing: false, error: '' }; } },
      error: error => { draft.saving = false; draft.error = error?.error?.message || 'Não foi possível salvar este log.'; }
    });
  }
  testLog(log: LogConfiguration): void {
    const draft = this.logDrafts[log.type]; if (!draft?.targetId || draft.testing) return;
    draft.testing = true; draft.error = '';
    this.managedServersService.testLog(this.selectedServerId, log.type, draft.targetId).subscribe({ next: () => draft.testing = false, error: error => { draft.testing = false; draft.error = error?.error?.message || 'Não foi possível enviar o teste.'; } });
  }
  selectFlow(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (value) this.requestFlowChange(Number(value));
  }
  addRole(list: string[], roleId: string): void { if (!list.includes(roleId)) list.push(roleId); }
  removeRole(list: string[], roleId: string): void { const index = list.indexOf(roleId); if (index >= 0) list.splice(index, 1); }
  addAutomaticRole(): void { if (this.autoJoinRoleId) this.save(() => this.managedServersService.addAutoJoinRole(this.selectedServerId, this.autoJoinRoleId), value => { this.autoJoinRoles = value; this.autoJoinRoleId = ''; }); }
  removeAutomaticRole(roleId: string): void { this.save(() => this.managedServersService.removeAutoJoinRole(this.selectedServerId, roleId), value => { this.autoJoinRoles = value; this.operationModal = { state: 'success', title: 'Cargo removido da entrada', message: 'O cargo continua existindo no Discord e membros atuais não foram alterados.', details: [] }; }); }
  updateAutomaticEnabled(enabled: boolean): void { this.save(() => this.managedServersService.updateAutoJoinEnabled(this.selectedServerId, enabled), value => { this.autoJoinRoles = value; this.operationModal = { state: 'success', title: enabled ? 'Atribuição automática ativada' : 'Atribuição automática desativada', message: enabled ? 'Novos membros voltarão a receber os cargos configurados.' : 'Novos membros deixarão de receber automaticamente os cargos configurados.', details: [] }; }); }
  repairPortariaVisitorAutoJoin(): void {
    const visitorRoleId = this.autoJoinRoles?.portariaVisitorRoleId;
    if (!visitorRoleId) return;
    const alreadyConfigured = this.autoJoinRoles?.roles.some(role => role.id === visitorRoleId);
    this.save(() => {
      if (alreadyConfigured) return this.autoJoinRoles!.enabled
        ? of(this.autoJoinRoles!)
        : this.managedServersService.updateAutoJoinEnabled(this.selectedServerId, true);
      return this.managedServersService.addAutoJoinRole(this.selectedServerId, visitorRoleId).pipe(
        concatMap(state => state.enabled ? of(state) : this.managedServersService.updateAutoJoinEnabled(this.selectedServerId, true))
      );
    }, state => this.autoJoinRoles = state);
  }
  get portariaVisitorAlreadyAutoJoined(): boolean { const id = this.autoJoinRoles?.portariaVisitorRoleId; return !!id && !!this.autoJoinRoles?.roles.some(role => role.id === id); }
  get availableAutoJoinRoles(): GuildRole[] { const configured = new Set(this.autoJoinRoles?.roles.map(role => role.id) || []); return this.orderedRoles.filter(role => !configured.has(role.id) && role.editableByBot && !role.managed); }
  addQuestion(): void { if (this.portaria && this.portaria.questions.length < 5) this.portaria.questions.push({ label: '', placeholder: '', required: true, position: this.portaria.questions.length + 1 }); }
  removeQuestion(index: number): void { this.portaria?.questions.splice(index, 1); this.portaria?.questions.forEach((question, i) => question.position = i + 1); }
  saveStaffRoles(): void {
    const submittedRoleIds = [...this.staffRoleDraft];
    this.save(
      () => this.managedServersService.updateModerationStaffRoles(this.selectedServerId, submittedRoleIds),
      value => {
        this.moderationAccess = structuredClone(value);
        this.staff = structuredClone(value.staffRoles);
        if (this.sameRoleIdSet(this.staffRoleDraft, submittedRoleIds)) this.staffRoleDraft = [...value.staffRoles.roleIds];
      }
    );
  }
  saveBirthdayChannel(): void { this.save(() => this.managedServersService.updateBirthdayChannel(this.selectedServerId, this.birthdayChannelId), value => this.applyServerChannels(value)); }
  saveBumpProcessing(): void {
    const draft = this.bumpDraft; if (!draft) return;
    const submitted = structuredClone(draft.processing);
    this.saveBumpCard('processing', submitted, () => this.managedServersService.updateBumpProcessing(this.selectedServerId, submitted));
  }
  saveBumpWarning(): void {
    const draft = this.bumpDraft; if (!draft) return;
    draft.warning.messages = this.warningMessages(draft.warning.messages);
    const submitted: BumpWarningRequest = {
      enabled: draft.warning.enabled,
      targetChannelId: draft.warning.targetChannelId,
      messages: structuredClone(draft.warning.messages)
    };
    this.saveBumpCard('warning', submitted, () => this.managedServersService.updateBumpWarning(this.selectedServerId, submitted));
  }
  saveBumpIndividualReward(): void {
    const draft = this.bumpDraft; if (!draft) return;
    const submitted = structuredClone(draft.individualReward);
    this.saveBumpCard('individual', submitted, () => this.managedServersService.updateBumpIndividualReward(this.selectedServerId, submitted));
  }
  saveBumpMonthlyRanking(): void {
    const draft = this.bumpDraft; if (!draft) return;
    const submitted: BumpMonthlyRankingConfig = { ...structuredClone(draft.monthlyRanking), rewards: [...draft.monthlyRanking.rewards].sort((a, b) => a.position - b.position) };
    this.saveBumpCard('monthly', submitted, () => this.managedServersService.updateBumpMonthlyRanking(this.selectedServerId, submitted));
  }
  savePortariaRoles(): void {
    const submitted = { ...this.portariaRoleDraft };
    const previousVisitorRoleId = this.portariaBaseline ? this.portariaRoleIds(this.portariaBaseline.config).visitanteRoleId : null;
    this.save(() => this.managedServersService.updatePortariaRoles(this.selectedServerId, submitted), value => {
      if (!this.portaria || !this.portariaBaseline) return;
      const persistedRoleIds = this.portariaRoleIds(value);
      Object.assign(this.portaria.config, persistedRoleIds);
      Object.assign(this.portariaBaseline.config, persistedRoleIds);
      if (this.samePortariaRoles(this.portariaRoleDraft, submitted)) this.portariaRoleDraft = persistedRoleIds;
      const cleanupCandidate = previousVisitorRoleId && previousVisitorRoleId !== persistedRoleIds.visitanteRoleId
        ? previousVisitorRoleId : undefined;
      this.visitorAutoJoinCleanupRoleId = cleanupCandidate;
      this.refreshAutoJoinRoles(cleanupCandidate);
    });
  }
  keepPreviousVisitorAutoJoin(): void {
    const roleId = this.visitorAutoJoinCleanupRoleId;
    if (!roleId) return;
    this.visitorAutoJoinCleanupRoleId = undefined;
    this.operationModal = { state: 'success', title: 'Cargo automático mantido', message: `${this.roleName(roleId)} continuará sendo atribuído a novos membros independentemente da Portaria.`, details: [] };
  }
  removePreviousVisitorAutoJoin(): void {
    const roleId = this.visitorAutoJoinCleanupRoleId;
    if (!roleId) return;
    this.save(() => this.managedServersService.removeAutoJoinRole(this.selectedServerId, roleId), state => {
      this.autoJoinRoles = state;
      this.visitorAutoJoinCleanupRoleId = undefined;
      this.operationModal = { state: 'success', title: 'Cargo anterior removido da entrada', message: `${this.roleName(roleId)} não será mais atribuído automaticamente. O cargo e os membros atuais não foram alterados.`, details: [] };
    });
  }
  updatePortariaEnabled(enabled: boolean): void {
    if (!this.portaria || this.portaria.config.enabled === enabled) return;
    this.save(
      () => this.managedServersService.updatePortariaEnabled(this.selectedServerId, enabled),
      value => {
        if (!this.portaria || !this.portariaBaseline) return;
        this.portaria.config.enabled = value.config.enabled;
        this.portariaBaseline.config.enabled = value.config.enabled;
        this.bypassPortariaEnabled = value.config.enabled;
        this.portariaBypasses = this.portariaBypasses.map(bypass => ({
          ...bypass,
          effective: value.config.enabled && bypass.active && !bypass.expired
        }));
      }
    );
  }
  saveEntry(): void { if (this.portaria) this.save(() => this.managedServersService.updatePortariaEntry(this.selectedServerId, this.portaria!.config, this.selectedFlow?.id), value => this.applyPersistedPortariaState(value)); }
  saveForm(): void { if (this.portaria && this.selectedFlow) this.save(() => this.managedServersService.updatePortariaForm(this.selectedServerId, this.selectedFlow!.id, this.portaria!.config.formularioPortariaAtivo, this.portaria!.questions), value => this.applyPersistedPortariaState(value)); }
  saveResult(): void { if (this.selectedFlow) this.save(() => this.managedServersService.updatePortariaResult(this.selectedServerId, this.selectedFlow!.id, this.selectedFlow!), value => this.applyPersistedPortariaState(value)); }
  publishPortariaFlow(): void {
    const flow = this.selectedFlow;
    if (!flow || !this.publicationChannelId || !this.canPublishPortariaFlow) return;
    const request: PortariaPublicationRequest = { channelId: this.publicationChannelId };
    if (this.publicationCustomizeMessage) request.message = this.publicationMessage;
    if (this.publicationCustomizeButton) request.buttonText = this.publicationButtonText;
    this.save(() => this.managedServersService.publishPortariaFlow(this.selectedServerId, flow.id, request), result => {
      this.operationModal = {
        state: 'success',
        title: 'Publicação concluída',
        message: result.created
          ? 'Mensagem de acesso publicada com sucesso.'
          : result.updated
            ? 'Publicação atualizada com sucesso.'
            : result.reused
            ? 'Este formulário já possui uma publicação ativa nesse canal.'
            : 'Mensagem de acesso confirmada com sucesso.',
        details: []
      };
      this.capturePublicationDraftBaseline();
    }, () => this.publishPortariaFlow());
  }
  createFlow(): void { if (this.newFlowName.trim() && this.newFlowTargetChannelId) this.save(() => this.managedServersService.createPortariaFlow(this.selectedServerId, this.newFlowName, this.newFlowTargetChannelId), value => { this.applyPersistedPortariaState(value); this.captureDraftBaselines(); }); }
  createPrivateArea(): void {
    const channelNames = this.normalizedPrivateChannelNames;
    if (!this.privateAllowedRoleIds.length) return;
    this.prepareConfirmation('Criar área privada', `Categoria ${this.normalizedPrivateCategoryName} com ${channelNames.join(', ')}.`, {
      operation: 'private-area', categoryName: this.normalizedPrivateCategoryName, channelNames,
      allowedRoleIds: [...this.privateAllowedRoleIds]
    });
  }
  preparePortaria(): void {
    const selectedStaff = [...this.portariaStaffRoleIds];
    if (!selectedStaff.length && !this.resources?.roles.length) return;
    const request: GuildOperationRequest = this.portariaCreationMode === 'template'
      ? { operation: 'portaria-template', visitorRoleName: this.visitorRoleName.trim() || 'Visitante', categoryName: this.portariaCategoryName.trim() || 'Portaria', createApproved: this.createApproved, createRejected: this.createRejected, staffAccessRoleIds: selectedStaff }
      : { operation: 'portaria-manual', visitorRoleId: this.manualVisitorRoleId, welcomeChannelId: this.manualWelcomeChannelId, targetChannelId: this.manualTargetChannelId, approvedTargetChannelId: this.manualApprovedChannelId || null, rejectedTargetChannelId: this.manualRejectedChannelId || null, staffAccessRoleIds: selectedStaff };
    this.prepareConfirmation('Configurar Portaria', selectedStaff.length ? `Aplicará acesso para ${selectedStaff.length} cargo(s) selecionado(s).` : 'Nenhum cargo de staff receberá novo acesso; confirme esta escolha.', request);
  }
  repairPortaria(operation: Extract<GuildOperationRequest, { operation: 'visitor-isolation' | 'portaria-repair-roles' | 'portaria-repair-structure' }>): void {
    this.prepareConfirmation('Reparar Portaria', 'O Coddy reconciliará somente os recursos funcionais existentes.', operation);
  }
  preparePermissionsRepair(): void { this.prepareConfirmation('Reparar permissões', 'Aplicará allows aos cargos selecionados sem remover overwrites customizados.', { operation: 'portaria-permissions', staffAccessRoleIds: [...this.portariaStaffRoleIds] }); }
  confirmPending(): void {
    const pending = this.pendingConfirmation;
    if (!pending) return;
    this.pendingConfirmation = undefined;
    if (pending.deleteFlowId != null) { this.save(() => this.managedServersService.deletePortariaFlow(this.selectedServerId, pending.deleteFlowId!), result => { this.operationModal = { state: 'success', title: 'Formulário removido', message: result.warnings?.length ? 'O formulário foi removido, com um aviso de limpeza.' : 'O formulário e suas publicações foram removidos. Canais e cargos foram preservados.', details: [`Publicações removidas: ${result.deletedPublications}`, ...(result.warnings || [])] }; this.loadConfiguration(); }); return; }
    const snapshot = structuredClone(pending.request);
    this.save(() => this.managedServersService.applyOperation(this.selectedServerId, snapshot), result => { this.operationResult = result; this.operationModal = { state: 'success', title: 'Operação concluída', message: 'As alterações foram aplicadas.', details: this.operationDetails(result) }; this.applyCreatedResource(snapshot, result); if (snapshot.operation === 'portaria-create-role' || snapshot.operation === 'portaria-create-channel') this.refreshResources(); });
  }
  cancelPending(): void { if (!this.mutationInFlight) { this.pendingConfirmation = undefined; this.operationModal = { state: 'cancelled', title: 'Operação cancelada', message: 'Nenhuma alteração foi aplicada.', details: [] }; } }
  closeOperationModal(): void { this.operationModal = undefined; }
  createFunctionalRole(rolePurpose: 'visitor' | 'provisional' | 'minor' | 'adult'): void { this.prepareConfirmation('Criar cargo funcional', 'O Coddy criará ou reutilizará o cargo canônico e atualizará a configuração da Portaria.', { operation: 'portaria-create-role', rolePurpose }); }
  createRoleForField(field: string): void { const purpose: Record<string, 'visitor' | 'provisional' | 'minor' | 'adult'> = { visitanteRoleId: 'visitor', acessoProvisorioRoleId: 'provisional', menor18RoleId: 'minor', maior18RoleId: 'adult' }; if (purpose[field]) this.createFunctionalRole(purpose[field]); }
  createFunctionalChannel(channelPurpose: 'entry' | 'target' | 'approved' | 'rejected'): void { this.prepareConfirmation('Criar canal funcional', 'O Coddy criará ou reutilizará o canal canônico.', { operation: 'portaria-create-channel', channelPurpose, flowId: this.selectedFlow?.id }); }
  deleteSelectedFlow(): void {
    if (!this.selectedFlow) return;
    const flow = this.selectedFlow;
    this.pendingConfirmation = { title: 'Excluir formulário', summary: `${flow.name} (#${flow.id}) e suas publicações serão removidos. Canais, categoria e cargos não serão apagados.`, request: { operation: 'portaria-repair-structure' }, deleteFlowId: flow.id };
  }
  retrySave(): void { if (!this.mutationInFlight) this.lastSave?.(); }
  serverInitials(server: ManagedServer): string { return server.name.split(' ').slice(0, 2).map(part => part.charAt(0)).join('').toUpperCase(); }
  hasServerIcon(server: ManagedServer): boolean { return !!server.iconUrl && !this.failedServerIcons.has(server.guildId); }
  markServerIconFailed(server: ManagedServer): void { this.failedServerIcons.add(server.guildId); }
  formatMemberCount(memberCount?: number): string { return memberCount == null ? '—' : new Intl.NumberFormat('pt-BR').format(memberCount); }
  get textChannels(): GuildChannel[] { return (this.resources?.channels ?? []).filter(channel => channel.type === 'text' || channel.type === 'news'); }
  get portariaPublicationHasUnsavedChanges(): boolean { return this.portariaDirty || this.portariaRolesDirty; }
  private resetPublicationDraft(): void { this.publicationChannelId = ''; this.publicationCustomizeMessage = false; this.publicationMessage = ''; this.publicationCustomizeButton = false; this.publicationButtonText = 'Abrir formulário'; this.capturePublicationDraftBaseline(); }
  private publicationDraftSnapshot(): string { return JSON.stringify({ channelId: this.publicationChannelId, customizeMessage: this.publicationCustomizeMessage, message: this.publicationMessage, customizeButton: this.publicationCustomizeButton, buttonText: this.publicationButtonText }); }
  private capturePublicationDraftBaseline(): void { this.publicationDraftBaseline = this.publicationDraftSnapshot(); }
  get publicationDraftDirty(): boolean { return this.publicationDraftBaseline !== undefined && this.publicationDraftSnapshot() !== this.publicationDraftBaseline; }
  get defaultPortariaPublicationMessage(): string { return `📋 **${this.selectedFlow?.name ?? 'Portaria'}**\nClique no botão para abrir o formulário.`; }
  get canPublishPortariaFlow(): boolean { return !!this.selectedFlow && !!this.publicationChannelId && !this.mutationInFlight && !this.portariaPublicationHasUnsavedChanges && (!this.publicationCustomizeMessage || this.publicationMessage.length <= 2000) && (!this.publicationCustomizeButton || (this.publicationButtonText.trim().length > 0 && this.publicationButtonText.length <= 80)); }
  channelMissing(channelId: string | null): boolean { return !!channelId && !this.textChannels.some(channel => channel.id === channelId); }
  channelLabel(channelId: string | null): string { const channel = this.textChannels.find(item => item.id === channelId); return channel ? `# ${channel.name}` : `Canal removido (${channelId})`; }
  bumpChannelOptions(channelId: string | null): { id: string; label: string; disabled: boolean }[] {
    const options = this.textChannels.map(channel => ({ id: channel.id, label: `# ${channel.name}`, disabled: false }));
    if (channelId && !options.some(option => option.id === channelId)) options.push({ id: channelId, label: `Canal configurado indisponível — ID ${channelId}`, disabled: true });
    return options;
  }
  get bumpRoleOptions(): { id: string; label: string; disabled: boolean }[] {
    return this.orderedRoles.filter(role => role.editableByBot && !role.managed).map(role => ({ id: role.id, label: role.name, disabled: false }));
  }
  bumpRoleOptionsFor(roleId: string | null): { id: string; label: string; disabled: boolean }[] {
    const options = [...this.bumpRoleOptions];
    if (roleId && !options.some(option => option.id === roleId)) options.push({ id: roleId, label: `Cargo configurado indisponível — ID ${roleId}`, disabled: true });
    return options;
  }
  warningMessagesText(): string { return this.bumpDraft?.warning.messages.join('\n') ?? ''; }
  updateWarningMessages(value: string): void { if (this.bumpDraft) this.bumpDraft.warning.messages = this.warningMessages(value.split(/\r?\n/)); }
  warningTimestamp(value: string | null): string { return value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : 'Ainda não registrado'; }
  get monthlyTiers() { return [...(this.bumpDraft?.monthlyRanking.rewards ?? [])].sort((a, b) => a.position - b.position); }
  isBumpCardDirty(card: BumpCard): boolean { return !!this.bumpDraft && !!this.bumpPersisted && this.bumpCardSnapshot(this.bumpDraft, card) !== this.bumpCardSnapshot(this.bumpPersisted, card); }
  get bumpMutationInFlight(): boolean { return (['processing', 'warning', 'individual', 'monthly'] as BumpCard[]).some(card => this.bumpSaveState[card] === 'saving'); }
  get orderedRoles(): GuildRole[] { return [...(this.resources?.roles ?? [])].sort((first, second) => second.position - first.position); }
  get persistedStaffRoleIds(): string[] { return this.staff?.roleIds ?? []; }
  get visitorAutoJoinCleanupRoleName(): string { return this.visitorAutoJoinCleanupRoleId ? this.roleName(this.visitorAutoJoinCleanupRoleId) : ''; }
  get portariaRolesDirty(): boolean { return !!this.portariaBaseline && !this.samePortariaRoles(this.portariaRoleDraft, this.portariaRoleIds(this.portariaBaseline.config)); }
  private portariaRoleIds(config: PortariaRoleIds | PortariaConfig): PortariaRoleIds {
    return { visitanteRoleId: config.visitanteRoleId ?? null, acessoProvisorioRoleId: config.acessoProvisorioRoleId ?? null,
      maior18RoleId: config.maior18RoleId ?? null, menor18RoleId: config.menor18RoleId ?? null };
  }
  private samePortariaRoles(first: PortariaRoleIds, second: PortariaRoleIds): boolean {
    return first.visitanteRoleId === second.visitanteRoleId && first.acessoProvisorioRoleId === second.acessoProvisorioRoleId
      && first.maior18RoleId === second.maior18RoleId && first.menor18RoleId === second.menor18RoleId;
  }
  get staffRolesDirty(): boolean {
    return !this.sameRoleIdSet(this.persistedStaffRoleIds, this.staffRoleDraft);
  }
  get pendingStaffRemovals(): GuildRole[] { return this.orderedRoles.filter(role => this.persistedStaffRoleIds.includes(role.id) && !this.staffRoleDraft.includes(role.id)); }
  restoreStaffRole(roleId: string): void { this.addRole(this.staffRoleDraft, roleId); }
  get portariaPreview(): StructurePreview { return this.buildPortariaPreview(); }
  get privateAreaPreview(): StructurePreview { return this.buildPrivateAreaPreview(); }

  previewTargetLabel(target: { kind: string; name?: string }): string {
    return target.name ? `${this.resourceTypeLabel(target.kind)} ${target.name}` : this.resourceTypeLabel(target.kind);
  }
  previewSubjectLabel(subject: { kind: string; id?: string; name?: string }): string {
    if (subject.kind === 'everyone') return '@everyone';
    return subject.name || this.resources?.roles.find(role => role.id === subject.id)?.name || `Cargo ${subject.id || 'planejado'}`;
  }
  resourceTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      category: 'Categoria', text: 'Canal', news: 'Canal de anúncios', voice: 'Canal de voz',
      stage_voice: 'Palco', forum: 'Fórum', media: 'Mídia', 'planned-channel': 'Canal planejado'
    };
    return labels[type] || 'Canal';
  }

  private save<T>(requestFactory: () => Observable<T>, success: (value: T) => void, retry?: () => void): void {
    if (this.mutationInFlight) return;
    const guildId = this.selectedServerId;
    this.lastSave = retry ?? (() => this.save(requestFactory, success));
    this.mutationInFlight = true; this.saveState = 'saving'; this.saveError = '';
    requestFactory().subscribe({
      next: value => {
        if (guildId !== this.selectedServerId) return;
        success(value); this.mutationInFlight = false; this.saveState = 'saved'; this.lastSave = undefined;
      },
      error: error => {
        if (guildId !== this.selectedServerId) return;
        this.mutationInFlight = false; this.saveState = 'error';
        this.saveError = error?.error?.message || 'Não foi possível salvar. Seu rascunho foi mantido.';
        this.operationModal = { state: 'error', title: 'Não foi possível concluir', message: this.saveError, details: [] };
      }
    });
  }
  private buildPortariaPreview(): StructurePreview {
    const categoryName = this.portariaCategoryName.trim() || 'Portaria';
    const visitorName = this.visitorRoleName.trim() || 'Visitante';
    const channels = ['boas-vindas', 'fichas', ...(this.createApproved ? ['aprovados'] : []), ...(this.createRejected ? ['reprovados'] : [])];
    const visitor: PreviewSubjectRef = { kind: 'planned-role', name: visitorName };
    const changes: PermissionChange[] = [];
    channels.forEach((name, index) => {
      const target = { kind: 'planned-channel', name };
      changes.push({ target, subject: { kind: 'everyone' }, permission: 'VIEW_CHANNEL', effect: 'deny' });
      if (index === 0) {
        changes.push({ target, subject: visitor, permission: 'VIEW_CHANNEL', effect: 'allow' });
        this.portariaStaffRoleIds.forEach(id => changes.push({ target, subject: { kind: 'role', id }, permission: 'VIEW_CHANNEL', effect: 'allow' }));
      } else {
        changes.push({ target, subject: visitor, permission: 'VIEW_CHANNEL', effect: 'deny' });
        this.portariaStaffRoleIds.forEach(id => changes.push({ target, subject: { kind: 'role', id }, permission: 'VIEW_CHANNEL', effect: 'allow' }));
      }
    });
    const affectedExistingResources = this.isolateVisitors ? this.existingResources : [];
    affectedExistingResources.forEach(resource => changes.push({ target: { kind: resource.type, id: resource.id, name: resource.name }, subject: visitor, permission: 'VIEW_CHANNEL', effect: 'deny' }));
    return this.structurePreview('portaria', [{ name: visitorName }], categoryName, channels, changes, this.selectedRolesWarning(this.staffRoleDraft), affectedExistingResources);
  }
  private buildPrivateAreaPreview(): StructurePreview {
    const categoryName = this.normalizedPrivateCategoryName;
    const plannedChannels = this.normalizedPrivateChannelNames;
    const roleIds = [...new Set(this.privateAllowedRoleIds)];
    const changes = plannedChannels.flatMap(name => {
      const target = { kind: 'planned-channel', name };
      return [
        { target, subject: { kind: 'everyone' } as PreviewSubjectRef, permission: 'VIEW_CHANNEL', effect: 'deny' as const },
        ...roleIds.map(id => ({ target, subject: { kind: 'role' as const, id }, permission: 'VIEW_CHANNEL', effect: 'allow' as const }))
      ];
    });
    return this.structurePreview('private-area', [], categoryName, plannedChannels, changes, this.selectedRolesWarning(roleIds));
  }
  get portariaDirty(): boolean { return !!this.portaria && !!this.portariaBaseline && this.portariaSnapshot(this.portaria) !== this.portariaSnapshot(this.portariaBaseline); }
  get portariaWizardDirty(): boolean { return !!this.portariaWizardBaseline && this.portariaWizardSnapshot() !== JSON.stringify(this.portariaWizardBaseline); }
  get privateAreaDirty(): boolean { return !!this.privateAreaBaseline && this.privateAreaSnapshot() !== JSON.stringify(this.privateAreaBaseline); }
  get channelsDirty(): boolean { return this.channelsBaseline !== undefined && this.channelsSnapshot() !== this.channelsBaseline; }
  get collaborativeDirty(): boolean { return !!this.collaborativeDraft && this.collaborativeBaseline !== undefined && JSON.stringify(this.collaborativeDraft) !== this.collaborativeBaseline; }
  get bypassDraftDirty(): boolean { return JSON.stringify(this.bypassDraft) !== this.bypassDraftBaseline; }
  hasUnsavedChanges(): boolean { return this.xpDirty || this.aiDirty || this.vipDirty || this.backupDirty || this.themeDirty || this.channelsDirty || this.staffRolesDirty || this.collaborativeDirty || this.bypassDraftDirty || this.portariaRolesDirty || this.portariaDirty || this.portariaWizardDirty || this.privateAreaDirty || this.publicationDraftDirty || (['processing', 'warning', 'individual', 'monthly'] as BumpCard[]).some(card => this.isBumpCardDirty(card)) || this.orderedLogs.some(log => this.isLogDirty(log)); }
  get activeLogsCount(): number { return (this.logs?.logs ?? []).filter(log => log.enabled).length; }
  get logsHaveProblems(): boolean { return (this.logs?.logs ?? []).some(log => !!log.target && (log.target.missing || log.target.writable === false)); }
  get protectionStatus(): 'complete' | 'partial' | 'limited' | 'unknown' {
    const capabilities = this.resources?.botCapabilities;
    if (capabilities?.hasAdministrator == null || capabilities.roleHierarchyOk == null) return 'unknown';
    return capabilities.hasAdministrator && capabilities.roleHierarchyOk ? 'complete' : capabilities.hasAdministrator ? 'partial' : 'limited';
  }
  requestOverviewSection(section: ServerSection): void { this.requestNavigation(this.selectedServerId, section); }
  continueEditing(): void { this.pendingNavigation = undefined; }
  discardAndNavigate(): void {
    if (this.mutationInFlight || this.bumpMutationInFlight || this.xpSaving || this.aiSaving || this.vipSaving || this.backupSaving || this.themeSaving) return;
    const target = this.pendingNavigation;
    this.pendingNavigation = undefined;
    if (!target) return;
    this.staffRoleDraft = [...this.persistedStaffRoleIds];
    if (this.moderationAccess) {
      this.collaborativeDraft = structuredClone(this.moderationAccess.collaborativeModeration);
      this.collaborativeBaseline = JSON.stringify(this.moderationAccess.collaborativeModeration);
    }
    this.resetBypassDraft();
    this.backupDirty = false;
    this.themeDirty = false;
    if (this.portariaBaseline) this.portariaRoleDraft = this.portariaRoleIds(this.portariaBaseline.config);
    this.portaria = this.portariaBaseline ? structuredClone(this.portariaBaseline) : undefined;
    if (this.serverChannels) this.applyServerChannels(this.serverChannels);
    if (this.bumpPersisted) this.bumpDraft = structuredClone(this.bumpPersisted);
    this.restoreDraftBaselines();
    if (this.publicationDraftDirty) this.resetPublicationDraft();
    for (const log of this.logs?.logs ?? []) this.logDrafts[log.type] = { enabled: log.enabled, targetId: log.target?.id ?? null, saving: false, testing: false, error: '' };
    if (target.kind === 'flow') this.loadConfiguration(target.flowId);
    else this.navigateTo(target.guildId, target.section);
  }
  private prepareConfirmation(title: string, summary: string, request: GuildOperationRequest): void { if (!this.mutationInFlight) this.pendingConfirmation = { title, summary, request: structuredClone(request) }; }
  private operationDetails(result: GuildOperationResult): string[] {
    const item = (label: string, values: { key?: string; id: string }[]) => values.map(value => `${label}: ${value.key || value.id}`);
    return [...item('Criado', result.created), ...item('Reutilizado', result.reused), ...item('Atualizado', result.updated), ...(result.warnings || [])];
  }
  private applyCreatedResource(request: GuildOperationRequest, result: GuildOperationResult): void {
    const resource = result.resources;
    if (!resource) return;
    if (request.operation === 'portaria-create-role' && resource.roleId) {
      if (request.rolePurpose === 'visitor') this.manualVisitorRoleId = resource.roleId;
      const roleField = request.rolePurpose === 'visitor' ? 'visitanteRoleId'
        : request.rolePurpose === 'provisional' ? 'acessoProvisorioRoleId'
        : request.rolePurpose === 'minor' ? 'menor18RoleId' : 'maior18RoleId';
      this.portariaRoleDraft[roleField] = resource.roleId;
      if (this.portaria) this.portaria.config[roleField] = resource.roleId;
      if (this.portariaBaseline) this.portariaBaseline.config[roleField] = resource.roleId;
    }
    if (request.operation === 'portaria-create-channel' && resource.channelId && !this.portaria?.configured) {
      if (request.channelPurpose === 'entry') this.manualWelcomeChannelId = resource.channelId;
      if (request.channelPurpose === 'target') this.manualTargetChannelId = resource.channelId;
      if (request.channelPurpose === 'approved') this.manualApprovedChannelId = resource.channelId;
      if (request.channelPurpose === 'rejected') this.manualRejectedChannelId = resource.channelId;
    }
  }
  private refreshResources(): void { this.managedServersService.getResources(this.selectedServerId).subscribe({ next: resources => this.resources = resources }); }
  private refreshAutoJoinRoles(cleanupCandidate?: string): void {
    const guildId = this.selectedServerId;
    this.managedServersService.getAutoJoinRoles(guildId).subscribe({
      next: state => {
        if (guildId !== this.selectedServerId) return;
        this.autoJoinRoles = state;
        if (cleanupCandidate) this.visitorAutoJoinCleanupRoleId = state.roles.some(role => role.id === cleanupCandidate) ? cleanupCandidate : undefined;
      },
      error: () => { if (guildId === this.selectedServerId && cleanupCandidate) this.visitorAutoJoinCleanupRoleId = cleanupCandidate; }
    });
  }
  private roleName(roleId: string): string { return this.resources?.roles.find(role => role.id === roleId)?.name || `Cargo ${roleId}`; }
  get normalizedPrivateCategoryName(): string { return this.privateCategoryName.trim() || 'Área privada'; }
  get normalizedPrivateChannelNames(): string[] { const values = this.privateChannelNames.split(',').map(name => name.trim()).filter(Boolean); return values.length ? values : ['privado']; }
  private get existingResources(): { id: string; name: string; type: string }[] {
    const resources = [
      ...(this.resources?.categories ?? []).map(category => ({ ...category, type: 'category' })),
      ...(this.resources?.channels ?? []).map(channel => ({ id: channel.id, name: channel.name, type: channel.type }))
    ];
    return [...new Map(resources.map(resource => [resource.id, resource])).values()];
  }
  private structurePreview(type: string, roles: { name: string }[], categoryName: string, channels: string[], permissionChanges: PermissionChange[], warnings: string[], affectedExistingResources: { id: string; name: string; type: string }[] = []): StructurePreview {
    return { type, creates: { roles, categories: [{ name: categoryName }], channels: channels.map(name => ({ name, type: 'text', categoryName })) }, permissionChanges, affectedExistingResources, warnings, requiredBotPermissions: ['MANAGE_CHANNELS', 'MANAGE_ROLES'], botCapabilities: this.resources?.botCapabilities ?? { canManageChannels: false, canManageRoles: false, canApply: false, missingPermissions: [] } };
  }
  private selectedRolesWarning(ids: string[]): string[] { return this.orderedRoles.filter(role => ids.includes(role.id) && !role.editableByBot).map(role => `O cargo ${role.name} está acima do cargo do Coddy ou não pode ser editado.`); }
  private sameRoleIdSet(first: string[], second: string[]): boolean {
    const firstSet = new Set(first);
    const secondSet = new Set(second);
    return firstSet.size === secondSet.size && [...firstSet].every(roleId => secondSet.has(roleId));
  }
  private clearConfiguration(): void {
    this.resources = undefined; this.staff = undefined; this.moderationAccess = undefined; this.collaborativeDraft = undefined; this.collaborativeBaseline = undefined; this.portariaBypasses = []; this.bypassPortariaEnabled = true; this.bypassesLoading = false; this.bypassesError = ''; this.resetBypassDraft(); this.portaria = undefined; this.portariaBaseline = undefined; this.portariaWizardBaseline = undefined; this.privateAreaBaseline = undefined; this.autoJoinRoles = undefined; this.serverChannels = undefined; this.channelsBaseline = undefined; this.bumpPersisted = undefined; this.bumpDraft = undefined; this.bumpSaveState = { processing: 'idle', warning: 'idle', individual: 'idle', monthly: 'idle' }; this.bumpSaveError = {}; this.logs = undefined; this.logDrafts = {}; this.logsError = ''; this.autoJoinRoleId = ''; this.staffRoleDraft = []; this.portariaRoleDraft = { visitanteRoleId: null, acessoProvisorioRoleId: null, maior18RoleId: null, menor18RoleId: null }; this.resetPublicationDraft(); this.visitorAutoJoinCleanupRoleId = undefined;
    this.configurationLoading = false;
    this.configurationError = '';
    this.xpDirty = false; this.xpSaving = false; this.aiDirty = false; this.aiSaving = false; this.vipDirty = false; this.vipSaving = false; this.backupDirty = false; this.backupSaving = false; this.themeDirty = false; this.themeSaving = false;
    this.mutationInFlight = false; this.saveState = 'idle'; this.saveError = ''; this.lastSave = undefined;
  }
  private resolveRoute(): void {
    if (this.isLoading) return;
    const guildId = this.route.snapshot.paramMap.get('guildId');
    const requestedSection = this.route.snapshot.paramMap.get('section');
    if (!guildId) {
      this.invalidGuild = false;
      if (this.servers.length) this.navigateTo(this.servers[0].guildId, 'overview', true);
      return;
    }
    const server = this.servers.find(item => item.guildId === guildId);
    if (!server) { this.invalidGuild = true; this.selectedServerId = ''; this.clearConfiguration(); return; }
    this.invalidGuild = false;
    const section = this.sections.some(item => item.id === requestedSection) ? requestedSection as ServerSection : 'overview';
    if (!requestedSection || section !== requestedSection) { this.navigateTo(guildId, section, true); return; }
    const changedGuild = this.selectedServerId !== guildId;
    const changedSection = this.activeSection !== section;
    this.selectedServerId = guildId; this.activeSection = section;
    if (changedGuild) {
      this.clearConfiguration();
      if (section !== 'backups' && section !== 'themes') {
        this.loadConfiguration();
        this.loadLogs();
        if (section === 'moderation-access') this.loadPortariaBypasses();
      }
    } else if (changedSection && section !== 'backups' && section !== 'themes' && !this.resources) {
      this.loadConfiguration();
      this.loadLogs();
      if (section === 'moderation-access') this.loadPortariaBypasses();
    } else if (changedSection && section === 'cargos-automaticos') {
      this.refreshAutoJoinRoles();
    }
    if (!changedGuild && changedSection && this.resources && section === 'logs') this.loadLogs();
    if (!changedGuild && changedSection && this.resources && section === 'moderation-access') this.loadPortariaBypasses();
  }
  backToServers(): void {
    this.invalidGuild = false;
    if (this.servers.length) { this.navigateTo(this.servers[0].guildId, 'overview'); return; }
    const communityId = this.communityContext.snapshot.activeCommunity?.communityId;
    this.router.navigate(communityId == null ? ['/painel'] : ['/painel/comunidades', communityId, 'coddy']);
  }
  private requestNavigation(guildId: string, section: ServerSection): void {
    if (this.mutationInFlight || this.bumpMutationInFlight || this.xpSaving || this.aiSaving || this.vipSaving || this.backupSaving || this.themeSaving || (guildId === this.selectedServerId && section === this.activeSection)) return;
    if (this.hasUnsavedChanges()) { this.pendingNavigation = { kind: 'route', guildId, section }; return; }
    this.navigateTo(guildId, section);
  }
  private requestFlowChange(flowId: number): void {
    if (this.mutationInFlight || this.bumpMutationInFlight || this.xpSaving || this.aiSaving || this.vipSaving || this.backupSaving || this.themeSaving || flowId === this.selectedFlow?.id) return;
    if (this.hasUnsavedChanges()) { this.pendingNavigation = { kind: 'flow', flowId }; return; }
    this.loadConfiguration(flowId);
  }
  private applyPersistedPortariaState(value: PortariaState): void {
    this.portaria = structuredClone(value);
    this.portariaBaseline = structuredClone(value);
    this.bypassPortariaEnabled = value.config.enabled;
  }
  private portariaWizardSnapshot(): string { return JSON.stringify(this.portariaWizardDraft()); }
  private portariaWizardDraft(): PortariaWizardDraft { return { newFlowName: this.newFlowName, newFlowTargetChannelId: this.newFlowTargetChannelId, isolateVisitors: this.isolateVisitors, visitorRoleName: this.visitorRoleName, portariaCategoryName: this.portariaCategoryName, portariaStaffRoleIds: [...this.portariaStaffRoleIds], portariaCreationMode: this.portariaCreationMode, createApproved: this.createApproved, createRejected: this.createRejected, manualVisitorRoleId: this.manualVisitorRoleId, manualWelcomeChannelId: this.manualWelcomeChannelId, manualTargetChannelId: this.manualTargetChannelId, manualApprovedChannelId: this.manualApprovedChannelId, manualRejectedChannelId: this.manualRejectedChannelId }; }
  private privateAreaSnapshot(): string { return JSON.stringify({ privateCategoryName: this.privateCategoryName, privateChannelNames: this.privateChannelNames, privateAllowedRoleIds: this.privateAllowedRoleIds }); }
  private channelsSnapshot(): string { return JSON.stringify({ birthdayChannelId: this.birthdayChannelId }); }
  private applyServerChannels(value: ServerChannelsConfig): void { this.serverChannels = value; this.birthdayChannelId = value.birthdayChannelId; this.channelsBaseline = this.channelsSnapshot(); }
  private applyBump(value: BumpConfigResponse): void {
    this.bumpPersisted = structuredClone(value);
    this.bumpDraft = structuredClone(value);
  }
  private saveBumpCard<T>(card: BumpCard, submitted: T, request: () => Observable<BumpConfigResponse>): void {
    if (this.bumpMutationInFlight) return;
    const guildId = this.selectedServerId;
    const submittedSnapshot = JSON.stringify(submitted);
    this.bumpSaveState[card] = 'saving'; delete this.bumpSaveError[card];
    request().subscribe({
      next: response => {
        if (guildId !== this.selectedServerId || !this.bumpDraft) return;
        const currentSnapshot = this.bumpCardSnapshot(this.bumpDraft, card);
        const dirtyCards = new Map((['processing', 'warning', 'individual', 'monthly'] as BumpCard[]).map(item => [item, this.isBumpCardDirty(item)]));
        this.bumpPersisted = structuredClone(response);
        for (const otherCard of ['processing', 'warning', 'individual', 'monthly'] as BumpCard[]) {
          if (otherCard !== card && !dirtyCards.get(otherCard)) this.replaceBumpCard(this.bumpDraft, response, otherCard);
        }
        if (currentSnapshot === submittedSnapshot) this.replaceBumpCard(this.bumpDraft, response, card);
        this.bumpSaveState[card] = 'saved';
      },
      error: error => {
        if (guildId !== this.selectedServerId) return;
        this.bumpSaveState[card] = 'error';
        this.bumpSaveError[card] = error?.error?.message || 'Não foi possível salvar. Seu rascunho foi mantido.';
      }
    });
  }
  private replaceBumpCard(target: BumpConfigResponse, source: BumpConfigResponse, card: BumpCard): void {
    if (card === 'processing') target.processing = structuredClone(source.processing);
    if (card === 'warning') target.warning = structuredClone(source.warning);
    if (card === 'individual') target.individualReward = structuredClone(source.individualReward);
    if (card === 'monthly') target.monthlyRanking = structuredClone(source.monthlyRanking);
    target.operational = structuredClone(source.operational);
  }
  private bumpCardSnapshot(value: BumpConfigResponse, card: BumpCard): string {
    if (card === 'processing') return JSON.stringify(value.processing);
    if (card === 'warning') return JSON.stringify({
      enabled: value.warning.enabled,
      targetChannelId: value.warning.targetChannelId,
      messages: value.warning.messages
    });
    if (card === 'individual') return JSON.stringify(value.individualReward);
    return JSON.stringify({ ...value.monthlyRanking, rewards: [...value.monthlyRanking.rewards].sort((a, b) => a.position - b.position) });
  }
  private warningMessages(values: string[]): string[] { return values.map(message => message.trim()).filter(Boolean); }
  private captureDraftBaselines(): void { this.portariaWizardBaseline = structuredClone(this.portariaWizardDraft()); this.privateAreaBaseline = structuredClone({ privateCategoryName: this.privateCategoryName, privateChannelNames: this.privateChannelNames, privateAllowedRoleIds: this.privateAllowedRoleIds }); this.channelsBaseline = this.channelsSnapshot(); }
  private restoreDraftBaselines(): void {
    if (this.portariaWizardBaseline) Object.assign(this, structuredClone(this.portariaWizardBaseline));
    if (this.privateAreaBaseline) Object.assign(this, structuredClone(this.privateAreaBaseline));
  }
  private portariaSnapshot(portaria: PortariaState): string {
    return JSON.stringify({ config: portaria.config, selectedFlow: portaria.selectedFlow, questions: portaria.questions });
  }
  private navigateTo(guildId: string, section: ServerSection, replaceUrl = false): void {
    const communityId = this.communityContext.snapshot.activeCommunity?.communityId;
    if (communityId == null) return;
    this.router.navigate(
      ['/painel/comunidades', communityId, 'coddy', guildId, section],
      { replaceUrl }
    );
  }
}
