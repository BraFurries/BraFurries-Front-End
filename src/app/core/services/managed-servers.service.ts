import { HttpClient, HttpDownloadProgressEvent, HttpEventType } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, repeat, retry, timer } from 'rxjs';

import { environment } from '../../../environments/environment';

export interface ManagedServer {
  guildId: string;
  name: string;
  memberCount?: number;
  botOnline: boolean;
  iconUrl?: string | null;
}

export interface GuildRole { id: string; name: string; position: number; managed: boolean; editableByBot: boolean; }
export interface GuildChannel { id: string; name: string; type: string; categoryId?: string; }
export interface GuildCategory { id: string; name: string; }
export interface BotTopRole { id: string; name: string; position: number; }
export interface RoleHierarchyEntry { id: string; name: string; position: number; managed: boolean; }
export interface BotCapabilities {
  canManageChannels: boolean; canManageRoles: boolean; canApply: boolean; missingPermissions: string[];
  hasAdministrator?: boolean | null; roleHierarchyOk?: boolean | null; protectionReady?: boolean | null;
  botTopRole?: BotTopRole | null; rolesAboveBot?: RoleHierarchyEntry[];
}
export interface GuildResources { guildId: string; roles: GuildRole[]; channels: GuildChannel[]; categories: GuildCategory[]; botCapabilities: BotCapabilities; }
export interface StaffRoles { roleIds: string[]; roles: GuildRole[]; }
export interface CollaborativeModerationConfig {
  enabled: boolean;
  emoji: string | null;
  minReactions: number;
  participantMode: 'ALL_NON_BOT_MEMBERS';
  protectedStaffRoleIds: string[];
}
export interface ModerationAccessState {
  guildId: string;
  staffRoles: StaffRoles;
  collaborativeModeration: CollaborativeModerationConfig;
}
export interface CollaborativeModerationUpdateRequest { enabled: boolean; emoji: string | null; minReactions: number; }
export interface PortariaBypass {
  id: number;
  type: 'invite' | 'account';
  value: string;
  accessMode: 'provisorio' | 'completo' | null;
  requiresForm: boolean | null;
  active: boolean;
  effective: boolean;
  expiresAt: string | null;
  expired: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}
export interface PortariaBypassesState { portariaEnabled: boolean; bypasses: PortariaBypass[]; }
export interface PortariaBypassCreateRequest {
  type: 'invite' | 'account';
  value: string;
  accessMode?: 'provisorio' | 'completo' | null;
  requiresForm?: boolean | null;
  active?: boolean;
  expiresAt?: string | null;
}
export interface PortariaBypassUpdateRequest {
  active?: boolean;
  accessMode?: 'provisorio' | 'completo' | null;
  requiresForm?: boolean | null;
  expiresAt?: string | null;
  clearExpiration?: boolean;
}
export interface ServerChannelsConfig { birthdayChannelId: string | null; aiChannelIds: string[]; aiChannelLimitEnabled: boolean; bumpProcessingChannelId: string | null; }
export interface BumpProcessingConfig { channelId: string | null; }
export interface BumpWarningConfig { enabled: boolean; sourceChannelId: string | null; targetChannelId: string | null; messages: string[]; }
export interface BumpRoleRewardConfig { enabled: boolean; roleId: string | null; durationMinutes: number; message: string | null; }
export interface BumpCoinRewardConfig { enabled: boolean; amount: number | null; }
export interface BumpIndividualRewardConfig { role: BumpRoleRewardConfig; coins: BumpCoinRewardConfig; }
export interface BumpMonthlyRewardTier { position: number; roleDurationDays: number; coins: number; }
export interface BumpMonthlyRankingConfig { enabled: boolean; sourceChannelId: string | null; roleId: string | null; rewards: BumpMonthlyRewardTier[]; }
export interface BumpOperationalState { warningNextAt: string | null; warningLastBumpAt: string | null; }
export interface BumpConfigResponse { processing: BumpProcessingConfig; warning: BumpWarningConfig; individualReward: BumpIndividualRewardConfig; monthlyRanking: BumpMonthlyRankingConfig; operational: BumpOperationalState; }
export interface BumpProcessingRequest { channelId: string | null; }
export interface BumpWarningRequest { enabled: boolean; targetChannelId: string | null; messages: string[]; }
export interface BumpIndividualRewardRequest { role: BumpRoleRewardConfig; coins: BumpCoinRewardConfig; }
export interface BumpMonthlyRankingRequest { enabled: boolean; sourceChannelId: string | null; roleId: string | null; rewards: BumpMonthlyRewardTier[]; }
export interface PortariaRoleIds { acessoProvisorioRoleId: string | null; visitanteRoleId: string | null; maior18RoleId: string | null; menor18RoleId: string | null; }
export interface PortariaConfig {
  enabled: boolean;
  acessoProvisorioRoleId?: string; visitanteRoleId?: string; maior18RoleId?: string; menor18RoleId?: string;
  aprovacaoAcessoProvisorioAtivo: boolean; aprovacaoAcessoProvisorioDuracaoDias: number;
  formularioPortariaAtivo: boolean; idadeMinimaContaFichaAtiva: boolean; idadeMinimaContaFichaDias: number;
  idadeMinimaContaAcessoProvisorioAtiva: boolean; idadeMinimaContaAcessoProvisorioDias: number;
  idadeMinimaEntradaServidorAtiva: boolean; idadeMinimaEntradaServidorAnos: number;
}
/** Web controls ONLY configuration; ticket operations and forms remain in Discord. */
export interface TemporaryRoleGrant {
  id: number; guildId: string; discordUserId: string; roleId: string;
  expiresAt: string; reason: string;
  status: 'ACTIVE' | 'CANCELLED' | 'EXPIRED';
  syncStatus: 'PENDING' | 'PROCESSING' | 'APPLIED' | 'FAILED';
  lastErrorCode: string | null; roleAddedByBot: boolean;
  version: number; createdAt: string; appliedAt: string | null;
}
export interface TemporaryRoleCreate {
  requestId: string; discordUserId: string; roleId: string;
  expiresAt: string; reason: string;
}
export interface TemporaryRoleRenew {
  expectedVersion: number; expiresAt: string; reason: string;
}

export interface PortariaClarificationSettings {
  enabled: boolean;
  categoryId: string | null;
}

export interface PortariaFlow { id: number; name: string; type: string; targetChannelId: string; approvedTargetChannelId?: string; rejectedTargetChannelId?: string; rejectionFeedbackEnabled: boolean; }
export interface PortariaQuestion { id?: number; label: string; placeholder?: string; position: number; required: boolean; }
export interface PortariaState { config: PortariaConfig; flows: PortariaFlow[]; selectedFlow?: PortariaFlow; questions: PortariaQuestion[]; configured: boolean; ambiguous: boolean; }
export interface PortariaPublicationRequest { channelId: string; message?: string; buttonText?: string; }
export interface PortariaPublicationResult { flowId: number; channelId: string; messageId: string; created: boolean; reused: boolean; updated: boolean; }
export interface AutoJoinRole { id: string; name?: string | null; missing: boolean; position?: number | null; protectedRole: boolean; protectedReason?: 'PORTARIA' | null; }
export interface AutoJoinWarning { code: string; message: string; }
export interface AutoJoinRolesState { enabled: boolean; roles: AutoJoinRole[]; portariaVisitorRoleId?: string | null; warnings: AutoJoinWarning[]; }
export interface LogTarget { id: string; type: 'text' | 'forum_thread' | null; name: string | null; parentId: string | null; parentName: string | null; writable: boolean | null; missing: boolean; }
export interface LogConfiguration { type: string; label: string; enabled: boolean; target: LogTarget | null; warnings: string[]; }
export interface LogsState { logs: LogConfiguration[]; targets: LogTarget[]; legacyTypes: string[]; }
export interface UpdateLogRequest { enabled: boolean; targetId?: string | null; }
export interface TestLogRequest { targetId: string; }
export interface AiConfigResponse {
  guildId: string;
  enabled: boolean;
  model: string;
  tokenConfigured: boolean;
  tokenUpdatedAt: string | null;
  channelLimitEnabled: boolean;
  channelIds: string[];
  adminChannelBypassEnabled: boolean;
  adminUserIds: string[];
}
export interface AiConfigUpdateRequest {
  enabled: boolean;
  model: string;
  channelLimitEnabled: boolean;
  channelIds: string[];
  adminChannelBypassEnabled: boolean;
  adminUserIds: string[];
}
export interface AiTokenStatusResponse { configured: boolean; updatedAt: string | null; }

export interface VipCustomRoleRange { topRoleId: string | null; bottomRoleId: string | null; }
export interface VipConfigResponse {
  guildId: string;
  roleIds: string[];
  roles: GuildRole[];
  customRolePrefix: string;
  customRoleRange: VipCustomRoleRange;
  allowStaffColors: boolean;
  runtimeSyncPending: boolean;
  warnings: string[];
}
export interface VipConfigUpdateRequest {
  roleIds: string[];
  customRolePrefix: string;
  customRoleRange: VipCustomRoleRange;
  allowStaffColors: boolean;
}

export interface XpTextConfig { enabled: boolean; baseMin: number; baseMax: number; cooldownMinSeconds: number; cooldownMaxSeconds: number; }
export interface XpVoiceConfig { enabled: boolean; xpPerMinute: number; socialBonusPct: number; socialBonusMinHumans: number; diminishingWindow1Minutes: number; diminishingWindow2Minutes: number; diminishingFactor2: number; diminishingFactor3: number; }
export interface XpProgressionConfig { k: number; p: number; b: number; }
export interface XpLimitsConfig { textDailyCapXp: number; voiceDailyCapXp: number; globalDailyCapXp: number; }
export interface XpLevelUpConfig { enabled: boolean; channelId: string | null; message: string | null; }
export interface XpAdvancedConfig { clearOnExit: boolean; multiplier: number; dailyCombo?: number | null; comboMultiplier?: number | null; }
export interface XpReconciliationState { required: boolean; requestedAt: string | null; reconciledAt: string | null; }
export interface XpConfigResponse {
  guildId: string;
  text: XpTextConfig;
  voice: XpVoiceConfig;
  progression: XpProgressionConfig;
  limits: XpLimitsConfig;
  levelUp: XpLevelUpConfig;
  advanced: XpAdvancedConfig;
  reconciliation: XpReconciliationState;
  levelUpPlaceholders: string[];
  comboRuntimeActive: boolean;
  runtimeRefreshPending: boolean;
}
export interface XpConfigUpdateRequest {
  text: XpTextConfig;
  voice: XpVoiceConfig;
  progression: XpProgressionConfig;
  limits: XpLimitsConfig;
  levelUp: XpLevelUpConfig;
  advanced: { clearOnExit: boolean; multiplier: number; };
}
export interface XpSimulationPoint { level: number; totalXp: number; xpFromPreviousLevel: number; }
export interface XpSimulationResponse { guildId: string; points: XpSimulationPoint[]; progression: XpProgressionConfig; }
export interface XpSimulationRequest { progression: XpProgressionConfig; levels: number[]; }

export interface PreviewResourceRef { kind: string; id?: string; name?: string; }
export interface PreviewSubjectRef { kind: 'everyone' | 'role' | 'planned-role'; id?: string; name?: string; }
export interface PermissionChange { target: PreviewResourceRef; subject: PreviewSubjectRef; permission: string; effect: 'allow' | 'deny'; }
export interface StructurePreview {
  type: string;
  creates: { roles: {name: string}[]; categories: {name: string}[]; channels: {name: string; type: string; categoryName: string}[]; };
  permissionChanges: PermissionChange[];
  affectedExistingResources: {id: string; name: string; type: string}[];
  warnings: string[];
  requiredBotPermissions: string[];
  botCapabilities: BotCapabilities;
}
export interface PrivateAreaOperationRequest { operation: 'private-area'; categoryName: string; channelNames: string[]; allowedRoleIds: string[]; }
export interface PortariaTemplateOperationRequest { operation: 'portaria-template'; visitorRoleName: string; categoryName: string; createApproved: boolean; createRejected: boolean; staffAccessRoleIds: string[]; }
export interface PortariaManualOperationRequest { operation: 'portaria-manual'; visitorRoleId: string; welcomeChannelId: string; targetChannelId: string; approvedTargetChannelId?: string | null; rejectedTargetChannelId?: string | null; staffAccessRoleIds: string[]; }
export interface VisitorIsolationOperationRequest { operation: 'visitor-isolation'; }
export interface PortariaRepairRolesOperationRequest { operation: 'portaria-repair-roles'; visitorRoleName?: string; }
export interface PortariaRepairStructureOperationRequest { operation: 'portaria-repair-structure'; categoryName?: string; }
export interface PortariaPermissionsOperationRequest { operation: 'portaria-permissions'; staffAccessRoleIds: string[]; }
export interface PortariaCreateRoleOperationRequest { operation: 'portaria-create-role'; rolePurpose: 'visitor' | 'provisional' | 'minor' | 'adult'; }
export interface PortariaCreateChannelOperationRequest { operation: 'portaria-create-channel'; channelPurpose: 'entry' | 'target' | 'approved' | 'rejected'; flowId?: number; categoryId?: string; }
export interface BackupContentSummary { roles: number; channels: number; permissionOverwrites: number; }
export interface BackupItem {
  id: number;
  name: string;
  type: 'MANUAL' | 'PERIODIC';
  createdAt: string | null;
  creatorDiscordUserId: string | null;
  summary: BackupContentSummary;
}
export interface BackupsResponse { canRestore: boolean; backups: BackupItem[]; }
export interface BackupSettings {
  periodicEnabled: boolean;
  frequency: 'daily' | 'weekly' | 'monthly';
}
export interface BackupRestoreRoleCandidate { id: string; name: string; position: number; }
export interface BackupRestoreAmbiguousRole {
  backupRoleId: number;
  backupDiscordId: string;
  name: string;
  candidates: BackupRestoreRoleCandidate[];
  canCreateNew: boolean;
}
export interface BackupRestoreBlocker { code: string; message: string; permissions?: string[]; roles?: { id: string; name: string; position: number }[]; count?: number; }
export interface BackupRestoreWarning { code: string; message: string; types?: number[]; }
export interface BackupRestorePreview {
  backup: BackupItem;
  scope: 'full' | 'roles' | 'channels' | 'permissions';
  bot: {
    available: boolean;
    botTopRole: { id: string; name: string; position: number } | null;
    rolesAboveBot: { id: string; name: string; position: number }[];
    missingPermissions: string[];
  };
  plan: {
    roles: { create: number; update: number; reuse: number; ambiguous: number; skipped?: number };
    channels: { create: number; update: number; reuse: number; unsupported: number; skipped?: number };
    permissions: { apply: number };
  };
  ambiguousRoles: BackupRestoreAmbiguousRole[];
  warnings: BackupRestoreWarning[];
  blockers: BackupRestoreBlocker[];
  ready: boolean;
}
export interface BackupRestoreDecision {
  duplicateStrategy?: 'merge' | 'explicit';
  roleResolutions?: Record<string, string>;
}
export type BackupOperationStatus = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'PARTIAL' | 'FAILED';
export interface BackupOperationStep {
  id: number;
  code: string;
  status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'SKIPPED' | 'FAILED';
  message: string;
  progressCurrent: number;
  progressTotal: number;
  detail: Record<string, unknown> | null;
  createdAt: string | null;
}
export interface BackupSnapshotOperation {
  id: number;
  backupType: 'MANUAL' | 'PERIODIC';
  requestedName: string;
  backupId: number | null;
  status: BackupOperationStatus;
  progressCurrent: number;
  progressTotal: number;
  currentStep: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string | null;
  errorCode: string | null;
  result: Record<string, unknown> | null;
  steps: BackupOperationStep[];
}
export interface BackupSnapshotOperationsResponse { operations: BackupSnapshotOperation[]; }
export interface BackupRestoreDomainResult { created: number; updated: number; reused: number; skipped: number; failed: number; }
export interface BackupRestoreResult {
  status: 'SUCCEEDED' | 'PARTIAL' | 'FAILED';
  roles?: BackupRestoreDomainResult;
  channels?: BackupRestoreDomainResult;
  permissions?: BackupRestoreDomainResult;
  warnings?: string[];
  failures?: { domain: string; item: string; code: string }[];
}
export interface BackupRestoreOperation {
  id: number;
  backupId: number;
  scope: 'full' | 'roles' | 'channels' | 'permissions';
  status: BackupOperationStatus;
  progressCurrent: number;
  progressTotal: number;
  currentStep: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string | null;
  errorCode: string | null;
  result: BackupRestoreResult | null;
  steps: BackupOperationStep[];
}
export interface BackupRestoreOperationsResponse { operations: BackupRestoreOperation[]; }

export type GuildOperationRequest = PrivateAreaOperationRequest | PortariaTemplateOperationRequest | PortariaManualOperationRequest | VisitorIsolationOperationRequest | PortariaRepairRolesOperationRequest | PortariaRepairStructureOperationRequest | PortariaPermissionsOperationRequest | PortariaCreateRoleOperationRequest | PortariaCreateChannelOperationRequest;
export interface DeleteFlowResult { flowId: number; deletedPublications: number; portariaConfigured: boolean; warnings: string[]; }
export interface GuildOperationResult { created: { key?: string; id: string }[]; reused: { key?: string; id: string }[]; updated: { key?: string; id: string; roleId?: string }[]; warnings: string[]; resources?: { roleId?: string; channelId?: string; }; changedCount?: number; unchangedCount?: number; skippedCount?: number; }

@Injectable({ providedIn: 'root' })
export class ManagedServersService {
  constructor(private readonly http: HttpClient) {}

  listTemporaryRoles(guildId: string): Observable<TemporaryRoleGrant[]> {
    return this.http.get<TemporaryRoleGrant[]>(this.guildUrl(guildId, 'temporary-roles'));
  }

  createTemporaryRole(guildId: string, request: TemporaryRoleCreate): Observable<TemporaryRoleGrant> {
    return this.http.post<TemporaryRoleGrant>(this.guildUrl(guildId, 'temporary-roles'), request);
  }

  renewTemporaryRole(guildId: string, id: number, request: TemporaryRoleRenew): Observable<TemporaryRoleGrant> {
    return this.http.patch<TemporaryRoleGrant>(this.guildUrl(guildId, `temporary-roles/${id}`), request);
  }

  cancelTemporaryRole(guildId: string, id: number, expectedVersion: number): Observable<TemporaryRoleGrant> {
    return this.http.delete<TemporaryRoleGrant>(
      this.guildUrl(guildId, `temporary-roles/${id}`),
      { params: { expectedVersion: String(expectedVersion) } }
    );
  }

  getManagedServers(): Observable<ManagedServer[]> {
    return this.http.get<ManagedServer[]>(`${environment.apiBaseUrl}/user/me/managed-servers`);
  }

  getBackups(guildId: string): Observable<BackupsResponse> {
    return this.http.get<BackupsResponse>(this.guildUrl(guildId, 'backups'));
  }
  getBackupSettings(guildId: string): Observable<BackupSettings> {
    return this.http.get<BackupSettings>(this.guildUrl(guildId, 'backups/settings'));
  }
  updateBackupSettings(guildId: string, request: BackupSettings): Observable<BackupSettings> {
    return this.http.put<BackupSettings>(this.guildUrl(guildId, 'backups/settings'), request);
  }
  createBackup(guildId: string, name: string, idempotencyKey: string): Observable<BackupSnapshotOperation> {
    return this.http.post<BackupSnapshotOperation>(
      this.guildUrl(guildId, 'backups'),
      { name },
      { headers: { 'Idempotency-Key': idempotencyKey } }
    );
  }
  deleteBackup(guildId: string, backupId: number): Observable<void> {
    return this.http.delete<void>(
      this.guildUrl(guildId, `backups/${backupId}`)
    );
  }
  getBackupSnapshotOperations(guildId: string): Observable<BackupSnapshotOperationsResponse> {
    return this.http.get<BackupSnapshotOperationsResponse>(
      this.guildUrl(guildId, 'backups/snapshot-operations')
    );
  }
  getBackupSnapshotOperation(guildId: string, operationId: number): Observable<BackupSnapshotOperation> {
    return this.http.get<BackupSnapshotOperation>(
      this.guildUrl(guildId, `backups/snapshot-operations/${operationId}`)
    );
  }
  previewBackupRestore(
    guildId: string,
    backupId: number,
    scope: BackupRestoreOperation['scope']
  ): Observable<BackupRestorePreview> {
    return this.http.post<BackupRestorePreview>(
      this.guildUrl(guildId, `backups/${backupId}/restore-preview`),
      { scope }
    );
  }
  startBackupRestore(
    guildId: string,
    backupId: number,
    scope: BackupRestoreOperation['scope'],
    decision: BackupRestoreDecision,
    idempotencyKey: string
  ): Observable<BackupRestoreOperation> {
    return this.http.post<BackupRestoreOperation>(
      this.guildUrl(guildId, `backups/${backupId}/restore`),
      { scope, decision, confirmed: true },
      { headers: { 'Idempotency-Key': idempotencyKey } }
    );
  }
  getBackupRestoreOperations(guildId: string): Observable<BackupRestoreOperationsResponse> {
    return this.http.get<BackupRestoreOperationsResponse>(
      this.guildUrl(guildId, 'backups/restore-operations')
    );
  }
  getBackupRestoreOperation(guildId: string, operationId: number): Observable<BackupRestoreOperation> {
    return this.http.get<BackupRestoreOperation>(
      this.guildUrl(guildId, `backups/restore-operations/${operationId}`)
    );
  }

  /**
   * Authenticated SSE over Angular HttpClient: its existing interceptor supplies
   * the bearer header (native EventSource cannot). Reconnects start with a
   * fresh persisted state from the API; unsubscription closes the XHR.
   */
  watchBackupOperation(
    guildId: string,
    kind: 'RESTORE' | 'SNAPSHOT',
    operationId: number
  ): Observable<BackupRestoreOperation | BackupSnapshotOperation> {
    const url = this.guildUrl(guildId, `backups/live/${kind}/${operationId}`);
    return new Observable<BackupRestoreOperation | BackupSnapshotOperation>(observer => {
      let offset = 0;
      let buffered = '';
      const request = this.http.get(url, {
        observe: 'events', reportProgress: true, responseType: 'text'
      }).subscribe({
        next: event => {
          if (event.type !== HttpEventType.DownloadProgress) return;
          const current = (event as HttpDownloadProgressEvent).partialText;
          if (current == null) return;
          buffered += current.slice(offset);
          offset = current.length;
          if (buffered.length > 1024 * 1024) {
            observer.error(new Error('SSE event too large'));
            return;
          }
          const frames = buffered.split(/\r?\n\r?\n/);
          buffered = frames.pop() ?? '';
          for (const frame of frames) {
            const lines = frame.split(/\r?\n/);
            const eventType = lines.find(line => line.startsWith('event:'))?.slice(6).trim();
            const data = lines.filter(line => line.startsWith('data:'))
              .map(line => line.slice(5).trimStart()).join('\n');
            if (eventType !== 'state' || !data) continue;
            try {
              observer.next(JSON.parse(data) as BackupRestoreOperation | BackupSnapshotOperation);
            } catch {
              observer.error(new Error('Invalid backup SSE payload'));
              return;
            }
          }
        },
        error: error => observer.error(error),
        complete: () => observer.complete()
      });
      return () => request.unsubscribe();
    }).pipe(
      retry({ delay: (_error, attempt) => timer(Math.min(30000, 1000 * 2 ** Math.min(attempt, 5))) }),
      repeat({ delay: () => timer(1500) })
    );
  }

  getResources(guildId: string): Observable<GuildResources> { return this.http.get<GuildResources>(this.guildUrl(guildId, 'resources')); }
  getServerChannels(guildId: string): Observable<ServerChannelsConfig> { return this.http.get<ServerChannelsConfig>(this.guildUrl(guildId, 'channels')); }
  updateBirthdayChannel(guildId: string, channelId: string | null): Observable<ServerChannelsConfig> { return this.http.put<ServerChannelsConfig>(this.guildUrl(guildId, 'channels/birthday'), { channelId }); }
  updateBumpProcessingChannel(guildId: string, channelId: string | null): Observable<ServerChannelsConfig> { return this.http.put<ServerChannelsConfig>(this.guildUrl(guildId, 'channels/disboard-bump-processing'), { channelId }); }
  getBump(guildId: string): Observable<BumpConfigResponse> { return this.http.get<BumpConfigResponse>(this.guildUrl(guildId, 'bump')); }
  updateBumpProcessing(guildId: string, request: BumpProcessingRequest): Observable<BumpConfigResponse> { return this.http.put<BumpConfigResponse>(this.guildUrl(guildId, 'bump/processing'), request); }
  updateBumpWarning(guildId: string, request: BumpWarningRequest): Observable<BumpConfigResponse> { return this.http.put<BumpConfigResponse>(this.guildUrl(guildId, 'bump/warning'), request); }
  updateBumpIndividualReward(guildId: string, request: BumpIndividualRewardRequest): Observable<BumpConfigResponse> { return this.http.put<BumpConfigResponse>(this.guildUrl(guildId, 'bump/individual-reward'), request); }
  updateBumpMonthlyRanking(guildId: string, request: BumpMonthlyRankingRequest): Observable<BumpConfigResponse> { return this.http.put<BumpConfigResponse>(this.guildUrl(guildId, 'bump/monthly-ranking'), request); }
  getStaffRoles(guildId: string): Observable<StaffRoles> { return this.http.get<StaffRoles>(this.guildUrl(guildId, 'staff-roles')); }
  updateStaffRoles(guildId: string, roleIds: string[]): Observable<StaffRoles> { return this.http.put<StaffRoles>(this.guildUrl(guildId, 'staff-roles'), { roleIds }); }
  getModerationAccess(guildId: string): Observable<ModerationAccessState> { return this.http.get<ModerationAccessState>(this.guildUrl(guildId, 'moderation-access')); }
  updateModerationStaffRoles(guildId: string, roleIds: string[]): Observable<ModerationAccessState> { return this.http.put<ModerationAccessState>(this.guildUrl(guildId, 'moderation-access/staff-roles'), { roleIds }); }
  updateCollaborativeModeration(guildId: string, request: CollaborativeModerationUpdateRequest): Observable<ModerationAccessState> { return this.http.put<ModerationAccessState>(this.guildUrl(guildId, 'moderation-access/collaborative-moderation'), request); }
  getPortariaBypasses(guildId: string): Observable<PortariaBypassesState> { return this.http.get<PortariaBypassesState>(this.guildUrl(guildId, 'portaria/bypasses')); }
  createPortariaBypass(guildId: string, request: PortariaBypassCreateRequest): Observable<PortariaBypass> { return this.http.post<PortariaBypass>(this.guildUrl(guildId, 'portaria/bypasses'), request); }
  updatePortariaBypass(guildId: string, bypass: Pick<PortariaBypass, 'type' | 'id'>, request: PortariaBypassUpdateRequest): Observable<PortariaBypass> {
    return this.http.put<PortariaBypass>(this.guildUrl(guildId, `portaria/bypasses/${bypass.type}/${bypass.id}`), request);
  }
  removePortariaBypass(guildId: string, bypass: Pick<PortariaBypass, 'type' | 'id'>): Observable<void> {
    return this.http.delete<void>(this.guildUrl(guildId, `portaria/bypasses/${bypass.type}/${bypass.id}`));
  }
  getVipRoles(guildId: string): Observable<StaffRoles> { return this.http.get<StaffRoles>(this.guildUrl(guildId, 'vip-roles')); }
  updateVipRoles(guildId: string, roleIds: string[]): Observable<StaffRoles> { return this.http.put<StaffRoles>(this.guildUrl(guildId, 'vip-roles'), { roleIds }); }
  updatePortariaRoles(guildId: string, roleIds: PortariaRoleIds): Observable<PortariaConfig> { return this.http.patch<PortariaConfig>(this.guildUrl(guildId, 'portaria/roles'), roleIds); }
  updatePortariaEnabled(guildId: string, enabled: boolean): Observable<PortariaState> { return this.http.patch<PortariaState>(this.guildUrl(guildId, 'portaria/enabled'), { enabled }); }
  getPortariaClarificationSettings(guildId: string): Observable<PortariaClarificationSettings> {
    return this.http.get<PortariaClarificationSettings>(this.guildUrl(guildId, 'portaria/clarification'));
  }
  updatePortariaClarificationSettings(guildId: string, config: PortariaClarificationSettings): Observable<PortariaClarificationSettings> {
    return this.http.put<PortariaClarificationSettings>(this.guildUrl(guildId, 'portaria/clarification'), config);
  }
  getPortaria(guildId: string, flowId?: number): Observable<PortariaState> {
    const suffix = flowId == null ? 'portaria' : `portaria?flowId=${flowId}`;
    return this.http.get<PortariaState>(this.guildUrl(guildId, suffix));
  }
  getAutoJoinRoles(guildId: string): Observable<AutoJoinRolesState> { return this.http.get<AutoJoinRolesState>(this.guildUrl(guildId, 'auto-join-roles')); }
  addAutoJoinRole(guildId: string, roleId: string): Observable<AutoJoinRolesState> { return this.http.post<AutoJoinRolesState>(this.guildUrl(guildId, `auto-join-roles/${roleId}`), {}); }
  removeAutoJoinRole(guildId: string, roleId: string): Observable<AutoJoinRolesState> { return this.http.delete<AutoJoinRolesState>(this.guildUrl(guildId, `auto-join-roles/${roleId}`)); }
  updateAutoJoinEnabled(guildId: string, enabled: boolean): Observable<AutoJoinRolesState> { return this.http.patch<AutoJoinRolesState>(this.guildUrl(guildId, 'auto-join-roles'), { enabled }); }
  getLogs(guildId: string): Observable<LogsState> { return this.http.get<LogsState>(this.guildUrl(guildId, 'logs')); }
  getVip(guildId: string): Observable<VipConfigResponse> { return this.http.get<VipConfigResponse>(this.guildUrl(guildId, 'vip')); }
  updateVip(guildId: string, request: VipConfigUpdateRequest): Observable<VipConfigResponse> { return this.http.put<VipConfigResponse>(this.guildUrl(guildId, 'vip'), request); }
  getAi(guildId: string): Observable<AiConfigResponse> { return this.http.get<AiConfigResponse>(this.guildUrl(guildId, 'ai')); }
  updateAi(guildId: string, request: AiConfigUpdateRequest): Observable<AiConfigResponse> { return this.http.put<AiConfigResponse>(this.guildUrl(guildId, 'ai'), request); }
  rotateAiToken(guildId: string, token: string): Observable<AiTokenStatusResponse> { return this.http.put<AiTokenStatusResponse>(this.guildUrl(guildId, 'ai/token'), { token }); }
  removeAiToken(guildId: string): Observable<AiTokenStatusResponse> { return this.http.delete<AiTokenStatusResponse>(this.guildUrl(guildId, 'ai/token')); }
  getXp(guildId: string): Observable<XpConfigResponse> { return this.http.get<XpConfigResponse>(this.guildUrl(guildId, 'xp')); }
  updateXp(guildId: string, request: XpConfigUpdateRequest): Observable<XpConfigResponse> { return this.http.put<XpConfigResponse>(this.guildUrl(guildId, 'xp'), request); }
  simulateXp(guildId: string, request: XpSimulationRequest): Observable<XpSimulationResponse> { return this.http.post<XpSimulationResponse>(this.guildUrl(guildId, 'xp/simulation'), request); }
  updateLog(guildId: string, logType: string, request: UpdateLogRequest): Observable<LogsState> { return this.http.put<LogsState>(this.guildUrl(guildId, `logs/${encodeURIComponent(logType)}`), request); }
  testLog(guildId: string, logType: string, targetId: string): Observable<void> { return this.http.post<void>(this.guildUrl(guildId, `logs/${encodeURIComponent(logType)}/test`), { targetId }); }
  createPortariaFlow(guildId: string, name: string, targetChannelId: string): Observable<PortariaState> { return this.http.post<PortariaState>(this.guildUrl(guildId, 'portaria/flows'), { name, targetChannelId }); }
  publishPortariaFlow(guildId: string, flowId: number, request: PortariaPublicationRequest): Observable<PortariaPublicationResult> {
    return this.http.post<PortariaPublicationResult>(this.guildUrl(guildId, `portaria/flows/${flowId}/publication`), request);
  }
  deletePortariaFlow(guildId: string, flowId: number): Observable<DeleteFlowResult> { return this.http.delete<DeleteFlowResult>(this.guildUrl(guildId, `portaria/flows/${flowId}`)); }
  updatePortariaEntry(guildId: string, config: PortariaConfig, flowId?: number): Observable<PortariaState> {
    const suffix = flowId == null ? 'portaria/entry' : `portaria/entry?flowId=${flowId}`;
    return this.http.patch<PortariaState>(this.guildUrl(guildId, suffix), config);
  }
  updatePortariaForm(guildId: string, flowId: number, formularioPortariaAtivo: boolean, questions: PortariaQuestion[]): Observable<PortariaState> {
    return this.http.patch<PortariaState>(this.guildUrl(guildId, `portaria/flows/${flowId}/form`), { formularioPortariaAtivo, questions });
  }
  updatePortariaResult(guildId: string, flowId: number, flow: PortariaFlow): Observable<PortariaState> {
    return this.http.patch<PortariaState>(this.guildUrl(guildId, `portaria/flows/${flowId}/result`), { targetChannelId: flow.targetChannelId, approvedTargetChannelId: flow.approvedTargetChannelId || null, rejectedTargetChannelId: flow.rejectedTargetChannelId || null, rejectionFeedbackEnabled: flow.rejectionFeedbackEnabled });
  }
  previewStructure(guildId: string, request: StructurePreviewRequest): Observable<StructurePreview> { return this.http.post<StructurePreview>(this.guildUrl(guildId, 'structure-preview'), request); }
  applyOperation(guildId: string, request: GuildOperationRequest): Observable<GuildOperationResult> { return this.http.post<GuildOperationResult>(this.guildUrl(guildId, 'operations'), request); }

  private guildUrl(guildId: string, suffix: string): string { return `${environment.apiBaseUrl}/user/me/guilds/${encodeURIComponent(guildId)}/${suffix}`; }
}

export interface StructurePreviewRequest { type: 'portaria' | 'private-area'; visitorRoleName?: string; categoryName?: string; channelNames?: string[]; staffRoleIds?: string[]; allowedRoleIds?: string[]; isolateVisitors?: boolean; }
