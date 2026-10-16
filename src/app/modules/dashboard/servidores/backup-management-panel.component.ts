import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges
} from '@angular/core';
import { catchError, EMPTY, forkJoin, merge, Subscription, switchMap, takeWhile, timer } from 'rxjs';

import {
  BackupItem,
  BackupOperationStatus,
  BackupRestoreDecision,
  BackupRestoreOperation,
  BackupRestorePreview,
  BackupSettings,
  BackupSnapshotOperation,
  BackupsResponse,
  ManagedServersService
} from '../../../core/services/managed-servers.service';

type RestoreScope = BackupRestoreOperation['scope'];
type DuplicateStrategy = '' | 'merge' | 'explicit';

@Component({
  selector: 'app-backup-management-panel',
  standalone: false,
  templateUrl: './backup-management-panel.component.html',
  styleUrl: './backup-management-panel.component.scss'
})
export class BackupManagementPanelComponent implements OnChanges, OnDestroy {
  @Input() guildId = '';
  @Output() dirtyChange = new EventEmitter<boolean>();
  @Output() savingChange = new EventEmitter<boolean>();

  catalog?: BackupsResponse;
  persistedSettings?: BackupSettings;
  settingsDraft?: BackupSettings;
  operations: BackupRestoreOperation[] = [];
  snapshotOperations: BackupSnapshotOperation[] = [];

  loading = false;
  error = '';
  settingsSaving = false;
  settingsMessage = '';

  createName = '';
  createBusy = false;
  createError = '';
  createMessage = '';
  selectedSnapshotOperation?: BackupSnapshotOperation;
  snapshotDetailsExpanded = false;

  selectedBackup?: BackupItem;
  restoreScope: RestoreScope = 'full';
  restorePreview?: BackupRestorePreview;
  previewLoading = false;
  previewError = '';
  duplicateStrategy: DuplicateStrategy = '';
  roleResolutions: Record<string, string> = {};
  restoreConfirmed = false;
  roleLimitAcknowledged = false;
  restoreBusy = false;
  restoreError = '';
  selectedOperation?: BackupRestoreOperation;
  restoreDetailsExpanded = false;

  deleteCandidate?: BackupItem;
  deleteBusyId?: number;
  deleteError = '';
  deleteMessage = '';

  private readonly terminalOperationVisibilityMs = 3 * 60 * 60 * 1000;
  private generation = 0;
  private settingsRevision = 0;
  private createIdempotencyKey = '';
  private createIdempotencyName = '';
  private restoreIdempotencyKey = '';
  private previewGeneration = 0;
  private pollSubscription?: Subscription;
  private snapshotPollSubscription?: Subscription;
  private operationVisibilityTimer?: ReturnType<typeof setTimeout>;
  private readonly dismissedSnapshotOperationIds = new Set<string>();
  private readonly dismissedRestoreOperationIds = new Set<string>();

  constructor(private readonly service: ManagedServersService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['guildId']) this.load();
  }

  ngOnDestroy(): void {
    this.generation++;
    this.previewGeneration++;
    this.pollSubscription?.unsubscribe();
    this.snapshotPollSubscription?.unsubscribe();
    if (this.operationVisibilityTimer) clearTimeout(this.operationVisibilityTimer);
    this.dirtyChange.emit(false);
    this.savingChange.emit(false);
  }

  get dirty(): boolean {
    return !!this.persistedSettings
      && !!this.settingsDraft
      && JSON.stringify(this.persistedSettings) !== JSON.stringify(this.settingsDraft);
  }

  get hardBlockers() {
    return (this.restorePreview?.blockers ?? [])
      .filter(blocker => blocker.code !== 'ROLE_RESOLUTION_REQUIRED');
  }

  get roleMutationAllowed(): boolean {
    return this.restoreScope === 'full' || this.restoreScope === 'roles';
  }

  get resolutionComplete(): boolean {
    const ambiguous = this.restorePreview?.ambiguousRoles ?? [];
    if (!ambiguous.length) return true;
    if (this.duplicateStrategy === 'merge') return this.roleMutationAllowed;
    if (this.duplicateStrategy !== 'explicit') return false;
    return ambiguous.every(item => {
      const resolution = this.roleResolutions[String(item.backupRoleId)];
      return !!resolution
        && (this.roleMutationAllowed || resolution !== 'CREATE_NEW');
    });
  }

  get estimatedRoleCreations(): number {
    if (!this.roleMutationAllowed || !this.restorePreview) return 0;
    // Existing preflight creations plus explicit CREATE_NEW duplicate choices.
    return this.restorePreview.plan.roles.create
      + this.restorePreview.ambiguousRoles.filter(role =>
        this.duplicateStrategy === 'explicit'
        && this.roleResolutions[String(role.backupRoleId)] === 'CREATE_NEW'
      ).length;
  }

  get canStartRestore(): boolean {
    return !!this.selectedBackup
      && !!this.restorePreview
      && this.hardBlockers.length === 0
      && this.resolutionComplete
      && this.restoreConfirmed
      && (!this.roleMutationAllowed || this.roleLimitAcknowledged)
      && !this.restoreBusy
      && !this.previewLoading
      && this.deleteBusyId !== this.selectedBackup?.id;
  }

  load(): void {
    const guildId = this.guildId;
    const generation = ++this.generation;
    this.previewGeneration++;
    this.pollSubscription?.unsubscribe();
    this.snapshotPollSubscription?.unsubscribe();
    if (this.operationVisibilityTimer) clearTimeout(this.operationVisibilityTimer);
    this.resetRestore();
    this.loading = !!guildId;
    this.error = '';
    this.catalog = undefined;
    this.persistedSettings = undefined;
    this.settingsDraft = undefined;
    this.operations = [];
    this.snapshotOperations = [];
    this.selectedSnapshotOperation = undefined;
    this.snapshotDetailsExpanded = false;
    this.deleteCandidate = undefined;
    this.deleteBusyId = undefined;
    this.deleteError = '';
    this.deleteMessage = '';
    this.emitDirty(false);

    if (!guildId) {
      this.loading = false;
      return;
    }

    forkJoin({
      catalog: this.service.getBackups(guildId),
      settings: this.service.getBackupSettings(guildId),
      operations: this.service.getBackupRestoreOperations(guildId),
      snapshotOperations: this.service.getBackupSnapshotOperations(guildId)
    }).subscribe({
      next: response => {
        if (guildId !== this.guildId || generation !== this.generation) return;
        this.catalog = response.catalog;
        this.persistedSettings = structuredClone(response.settings);
        this.settingsDraft = structuredClone(response.settings);
        this.operations = response.operations.operations;
        this.snapshotOperations = response.snapshotOperations.operations;
        this.settingsRevision = 0;
        this.loading = false;

        const activeRestore = this.operations.find(operation =>
          this.isActiveOperation(operation)
        );
        this.selectedOperation = activeRestore
          ?? this.operations.find(operation =>
            this.isRecentRestoreOperation(operation)
          );
        this.restoreDetailsExpanded = !!activeRestore;
        if (activeRestore) {
          this.startRestorePolling(activeRestore.id);
        }

        const activeSnapshot = this.snapshotOperations.find(operation =>
          this.isActiveOperation(operation)
        );
        this.selectedSnapshotOperation = activeSnapshot
          ?? this.snapshotOperations.find(operation =>
            this.isRecentSnapshotOperation(operation)
          );
        this.snapshotDetailsExpanded = !!activeSnapshot;
        if (activeSnapshot) {
          this.startSnapshotPolling(activeSnapshot.id);
        }
        this.scheduleOperationExpiry();
      },
      error: error => {
        if (guildId !== this.guildId || generation !== this.generation) return;
        this.error = this.errorMessage(error, 'Não foi possível carregar os Backups.');
        this.loading = false;
      }
    });
  }

  onSettingsChanged(): void {
    this.settingsRevision++;
    this.settingsMessage = '';
    this.emitDirty(this.dirty);
  }

  resetSettings(): void {
    if (!this.persistedSettings || this.settingsSaving) return;
    this.settingsDraft = structuredClone(this.persistedSettings);
    this.settingsRevision++;
    this.settingsMessage = '';
    this.error = '';
    this.emitDirty(false);
  }

  saveSettings(): void {
    if (!this.settingsDraft || !this.dirty || this.settingsSaving) return;
    const guildId = this.guildId;
    const submittedRevision = this.settingsRevision;
    const request = structuredClone(this.settingsDraft);

    this.settingsSaving = true;
    this.savingChange.emit(true);
    this.error = '';
    this.settingsMessage = '';

    this.service.updateBackupSettings(guildId, request).subscribe({
      next: response => {
        if (guildId !== this.guildId) return this.finishSettingsSave();
        this.persistedSettings = structuredClone(response);
        if (submittedRevision === this.settingsRevision) {
          this.settingsDraft = structuredClone(response);
          this.settingsMessage = 'Configuração de Backups salva.';
        } else {
          this.settingsMessage = 'Configuração salva; alterações feitas durante o salvamento continuam pendentes.';
        }
        this.finishSettingsSave();
        this.emitDirty(this.dirty);
      },
      error: error => {
        if (guildId === this.guildId) {
          this.error = this.errorMessage(error, 'Não foi possível salvar a configuração de Backups.');
        }
        this.finishSettingsSave();
      }
    });
  }

  onCreateNameChanged(): void {
    if (this.createIdempotencyName !== this.createName.trim()) {
      this.createIdempotencyKey = '';
      this.createIdempotencyName = '';
    }
    this.createError = '';
    this.createMessage = '';
  }

  createBackup(): void {
    const name = this.createName.trim();
    if (!name || this.createBusy) return;
    const guildId = this.guildId;
    if (!this.createIdempotencyKey) {
      this.createIdempotencyKey = this.newIdempotencyKey();
      this.createIdempotencyName = name;
    }

    this.createBusy = true;
    this.savingChange.emit(true);
    this.createError = '';
    this.createMessage = '';

    this.service.createBackup(
      guildId,
      name,
      this.createIdempotencyKey
    ).subscribe({
      next: operation => {
        if (guildId !== this.guildId) {
          this.finishCreate();
          return;
        }
        this.selectedSnapshotOperation = operation;
        this.upsertSnapshotOperation(operation);
        if (operation.status === 'PENDING' || operation.status === 'RUNNING') {
          this.snapshotDetailsExpanded = true;
          this.createMessage = 'Backup iniciado. Acompanhe o progresso abaixo.';
          this.startSnapshotPolling(operation.id);
        } else {
          this.handleSnapshotTerminal(operation);
        }
        this.finishCreate();
      },
      error: error => {
        if (guildId === this.guildId) {
          this.createError = this.errorMessage(error, 'Não foi possível iniciar o Backup.');
        }
        this.finishCreate();
      }
    });
  }

  openRestore(backup: BackupItem): void {
    if (!this.catalog?.canRestore) return;
    this.selectedBackup = backup;
    this.restoreScope = 'full';
    this.resetRestoreDecision();
    this.loadRestorePreview();
  }

  closeRestore(): void {
    this.previewGeneration++;
    this.selectedBackup = undefined;
    this.restorePreview = undefined;
    this.previewError = '';
    this.restoreError = '';
    this.restoreConfirmed = false;
    this.roleLimitAcknowledged = false;
    this.restoreIdempotencyKey = '';
  }

  onRestoreScopeChanged(): void {
    this.resetRestoreDecision();
    this.loadRestorePreview();
  }

  setDuplicateStrategy(strategy: DuplicateStrategy): void {
    if (strategy === 'merge' && !this.roleMutationAllowed) return;
    this.duplicateStrategy = strategy;
    this.roleResolutions = {};
    this.restoreConfirmed = false;
    this.roleLimitAcknowledged = false;
    this.restoreIdempotencyKey = '';
  }

  setRoleResolution(backupRoleId: number, value: string): void {
    if (value === 'CREATE_NEW' && !this.roleMutationAllowed) return;
    this.roleResolutions = {
      ...this.roleResolutions,
      [String(backupRoleId)]: value
    };
    this.restoreConfirmed = false;
    this.roleLimitAcknowledged = false;
    this.restoreIdempotencyKey = '';
  }

  onRestoreConfirmationChanged(): void {
    this.restoreError = '';
  }

  loadRestorePreview(): void {
    const backup = this.selectedBackup;
    const guildId = this.guildId;
    if (!backup || !guildId) return;
    const scope = this.restoreScope;
    const generation = ++this.previewGeneration;

    this.previewLoading = true;
    this.previewError = '';
    this.restorePreview = undefined;

    this.service.previewBackupRestore(guildId, backup.id, scope).subscribe({
      next: preview => {
        if (
          guildId !== this.guildId
          || generation !== this.previewGeneration
          || this.selectedBackup?.id !== backup.id
          || this.restoreScope !== scope
        ) return;
        this.restorePreview = preview;
        this.previewLoading = false;
      },
      error: error => {
        if (
          guildId !== this.guildId
          || generation !== this.previewGeneration
          || this.selectedBackup?.id !== backup.id
          || this.restoreScope !== scope
        ) return;
        this.previewLoading = false;
        this.previewError = this.errorMessage(
          error,
          'Não foi possível gerar o preflight vivo do restore.'
        );
      }
    });
  }

  startRestore(): void {
    const backup = this.selectedBackup;
    if (!backup || !this.canStartRestore) return;

    const guildId = this.guildId;
    if (!this.restoreIdempotencyKey) {
      this.restoreIdempotencyKey = this.newIdempotencyKey();
    }
    const decision: BackupRestoreDecision = this.buildRestoreDecision();

    this.restoreBusy = true;
    this.savingChange.emit(true);
    this.restoreError = '';

    this.service.startBackupRestore(
      guildId,
      backup.id,
      this.restoreScope,
      decision,
      this.restoreIdempotencyKey
    ).subscribe({
      next: operation => {
        if (guildId === this.guildId) {
          this.selectedOperation = operation;
          this.upsertOperation(operation);
          if (operation.status === 'PENDING' || operation.status === 'RUNNING') {
            this.restoreDetailsExpanded = true;
            this.startRestorePolling(operation.id);
          } else {
            this.handleRestoreTerminal(operation);
          }
        }
        this.finishRestoreStart();
      },
      error: error => {
        if (guildId === this.guildId) {
          this.restoreError = this.errorMessage(
            error,
            'Não foi possível iniciar o restore. A mesma tentativa pode ser reenviada com segurança.'
          );
        }
        this.finishRestoreStart();
      }
    });
  }

  operationForBackup(backupId: number): BackupRestoreOperation | undefined {
    return this.operations.find(operation => operation.backupId === backupId);
  }

  toggleSnapshotDetails(): void {
    if (!this.selectedSnapshotOperation || this.isActiveOperation(this.selectedSnapshotOperation)) return;
    this.snapshotDetailsExpanded = !this.snapshotDetailsExpanded;
  }

  toggleRestoreDetails(): void {
    if (!this.selectedOperation || this.isActiveOperation(this.selectedOperation)) return;
    this.restoreDetailsExpanded = !this.restoreDetailsExpanded;
  }

  dismissSnapshotOperation(): void {
    if (!this.selectedSnapshotOperation || this.isActiveOperation(this.selectedSnapshotOperation)) return;
    this.dismissedSnapshotOperationIds.add(
      this.operationSessionKey(this.selectedSnapshotOperation.id)
    );
    this.selectedSnapshotOperation = undefined;
    this.snapshotDetailsExpanded = false;
    this.scheduleOperationExpiry();
  }

  dismissRestoreOperation(): void {
    if (!this.selectedOperation || this.isActiveOperation(this.selectedOperation)) return;
    this.dismissedRestoreOperationIds.add(
      this.operationSessionKey(this.selectedOperation.id)
    );
    this.selectedOperation = undefined;
    this.restoreDetailsExpanded = false;
    this.scheduleOperationExpiry();
  }

  requestDelete(backup: BackupItem): void {
    if (!this.catalog?.canRestore || this.deleteBusyId != null) return;
    this.deleteCandidate = backup;
    this.deleteError = '';
    this.deleteMessage = '';
  }

  cancelDelete(): void {
    if (this.deleteBusyId != null) return;
    this.deleteCandidate = undefined;
    this.deleteError = '';
  }

  confirmDelete(): void {
    const backup = this.deleteCandidate;
    if (!backup || !this.catalog?.canRestore || this.deleteBusyId != null) return;

    const guildId = this.guildId;
    this.deleteBusyId = backup.id;
    this.deleteError = '';
    this.deleteMessage = '';
    this.savingChange.emit(true);

    this.service.deleteBackup(guildId, backup.id).subscribe({
      next: () => {
        if (guildId !== this.guildId) {
          this.finishDelete();
          return;
        }

        if (this.selectedBackup?.id === backup.id) {
          this.closeRestore();
        }
        if (this.catalog) {
          this.catalog = {
            ...this.catalog,
            backups: this.catalog.backups.filter(item => item.id !== backup.id)
          };
        }
        this.deleteCandidate = undefined;
        this.deleteMessage = 'Backup excluído com sucesso.';

        this.service.getBackups(guildId).subscribe({
          next: catalog => {
            if (guildId === this.guildId) {
              this.catalog = catalog;
            }
            this.finishDelete();
          },
          error: () => {
            if (guildId === this.guildId) {
              this.deleteError =
                'O Backup foi excluído, mas não foi possível atualizar o catálogo agora.';
            }
            this.finishDelete();
          }
        });
      },
      error: error => {
        if (guildId === this.guildId) {
          this.deleteError = this.errorMessage(
            error,
            'Não foi possível excluir o Backup.'
          );
        }
        this.finishDelete();
      }
    });
  }

  formatDate(value: string | null): string {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
  }

  typeLabel(type: BackupItem['type']): string {
    return type === 'PERIODIC' ? 'Automático' : 'Manual';
  }

  scopeLabel(scope: RestoreScope): string {
    return {
      full: 'Completo',
      roles: 'Somente cargos',
      channels: 'Somente canais',
      permissions: 'Somente permissões'
    }[scope];
  }

  statusLabel(status: BackupOperationStatus): string {
    return {
      PENDING: 'Pendente',
      RUNNING: 'Em andamento',
      SUCCEEDED: 'Concluído',
      PARTIAL: 'Parcial',
      FAILED: 'Falhou'
    }[status];
  }

  progressPercent(operation: { progressCurrent: number; progressTotal: number }): number {
    if (!operation.progressTotal) return 0;
    return Math.max(
      0,
      Math.min(100, Math.round((operation.progressCurrent / operation.progressTotal) * 100))
    );
  }

  stepStatusLabel(status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'SKIPPED' | 'FAILED'): string {
    return {
      PENDING: 'Pendente',
      RUNNING: 'Executando',
      SUCCEEDED: 'Concluído',
      SKIPPED: 'Ignorado',
      FAILED: 'Falhou'
    }[status];
  }

  private startRestorePolling(operationId: number): void {
    this.pollSubscription?.unsubscribe();
    const guildId = this.guildId;
    const generation = this.generation;

    // SSE is authoritative and carries full snapshots. The low-frequency
    // safety read covers interrupted webhooks or environments blocking streams.
    const live = this.service.watchBackupOperation(guildId, 'RESTORE', operationId);
    const safetyRead = timer(120000, 120000).pipe(
      switchMap(() => this.service.getBackupRestoreOperation(guildId, operationId).pipe(
        catchError(() => EMPTY)
      ))
    );
    this.pollSubscription = merge(live, safetyRead)
      .pipe(takeWhile(operation => this.isActiveOperation(operation), true))
      .subscribe({
        next: value => {
          if (guildId !== this.guildId || generation !== this.generation) {
            this.pollSubscription?.unsubscribe();
            return;
          }
          const operation = value as BackupRestoreOperation;
          this.selectedOperation = operation;
          this.upsertOperation(operation);
          if (this.isActiveOperation(operation)) {
            this.restoreDetailsExpanded = true;
          } else {
            this.handleRestoreTerminal(operation);
          }
        },
        error: error => {
          if (guildId !== this.guildId || generation !== this.generation) return;
          this.restoreError = this.errorMessage(error, 'Não foi possível atualizar o estado do restore.');
          this.pollSubscription?.unsubscribe();
        }
      });
  }

  private startSnapshotPolling(operationId: number): void {
    this.snapshotPollSubscription?.unsubscribe();
    const guildId = this.guildId;
    const generation = this.generation;

    const live = this.service.watchBackupOperation(guildId, 'SNAPSHOT', operationId);
    const safetyRead = timer(120000, 120000).pipe(
      switchMap(() => this.service.getBackupSnapshotOperation(guildId, operationId).pipe(
        catchError(() => EMPTY)
      ))
    );
    this.snapshotPollSubscription = merge(live, safetyRead)
      .pipe(takeWhile(operation => this.isActiveOperation(operation), true))
      .subscribe({
        next: value => {
          if (guildId !== this.guildId || generation !== this.generation) {
            this.snapshotPollSubscription?.unsubscribe();
            return;
          }
          const operation = value as BackupSnapshotOperation;
          this.selectedSnapshotOperation = operation;
          this.upsertSnapshotOperation(operation);
          if (this.isActiveOperation(operation)) {
            this.snapshotDetailsExpanded = true;
          } else {
            this.handleSnapshotTerminal(operation);
          }
        },
        error: error => {
          if (guildId !== this.guildId || generation !== this.generation) return;
          this.createError = this.errorMessage(
            error, 'Não foi possível atualizar o progresso da criação do Backup.'
          );
          this.snapshotPollSubscription?.unsubscribe();
        }
      });
  }

  private handleRestoreTerminal(operation: BackupRestoreOperation): void {
    this.restoreIdempotencyKey = '';
    this.selectedOperation = operation;
    this.restoreDetailsExpanded = false;
    this.scheduleOperationExpiry();
    if (operation.status === 'FAILED') {
      this.restoreError = operation.errorCode
        ? `Falha no restore: ${operation.errorCode}`
        : 'Falha no restore.';
    } else {
      this.restoreError = '';
    }
    this.refreshHistory();
  }

  private handleSnapshotTerminal(operation: BackupSnapshotOperation): void {
    this.selectedSnapshotOperation = operation;
    this.snapshotDetailsExpanded = false;
    this.scheduleOperationExpiry();
    if (operation.status === 'SUCCEEDED') {
      this.createName = '';
      this.createIdempotencyKey = '';
      this.createIdempotencyName = '';
      this.createMessage = 'Backup estrutural criado com sucesso.';
      this.createError = '';
    } else if (operation.status === 'PARTIAL') {
      this.createIdempotencyKey = '';
      this.createIdempotencyName = '';
      this.createMessage = 'O Backup terminou parcialmente. Consulte as etapas abaixo.';
    } else if (operation.status === 'FAILED') {
      this.createIdempotencyKey = '';
      this.createIdempotencyName = '';
      this.createError = operation.errorCode
        ? `Falha ao gerar o Backup: ${operation.errorCode}`
        : 'Falha ao gerar o Backup.';
    }
    this.refreshHistory();
  }

  private refreshHistory(): void {
    const guildId = this.guildId;
    const generation = this.generation;
    forkJoin({
      catalog: this.service.getBackups(guildId),
      operations: this.service.getBackupRestoreOperations(guildId),
      snapshotOperations: this.service.getBackupSnapshotOperations(guildId)
    }).subscribe({
      next: response => {
        if (guildId !== this.guildId || generation !== this.generation) return;
        this.catalog = response.catalog;
        this.operations = response.operations.operations;
        this.snapshotOperations = response.snapshotOperations.operations;

        const activeRestore = this.operations.find(operation => this.isActiveOperation(operation));
        const currentRestore = this.selectedOperation
          ? this.operations.find(item => item.id === this.selectedOperation!.id)
          : undefined;
        this.selectedOperation = activeRestore
          ?? (currentRestore && this.isRecentRestoreOperation(currentRestore)
            ? currentRestore
            : this.operations.find(operation =>
              this.isRecentRestoreOperation(operation)
            ));
        if (activeRestore) this.restoreDetailsExpanded = true;

        const activeSnapshot = this.snapshotOperations.find(operation => this.isActiveOperation(operation));
        const currentSnapshot = this.selectedSnapshotOperation
          ? this.snapshotOperations.find(item => item.id === this.selectedSnapshotOperation!.id)
          : undefined;
        this.selectedSnapshotOperation = activeSnapshot
          ?? (currentSnapshot && this.isRecentSnapshotOperation(currentSnapshot)
            ? currentSnapshot
            : this.snapshotOperations.find(operation =>
              this.isRecentSnapshotOperation(operation)
            ));
        if (activeSnapshot) this.snapshotDetailsExpanded = true;

        this.scheduleOperationExpiry();
      }
    });
  }

  private upsertOperation(operation: BackupRestoreOperation): void {
    this.operations = [
      operation,
      ...this.operations.filter(item => item.id !== operation.id)
    ];
  }

  private upsertSnapshotOperation(operation: BackupSnapshotOperation): void {
    this.snapshotOperations = [
      operation,
      ...this.snapshotOperations.filter(item => item.id !== operation.id)
    ];
  }

  private resetRestore(): void {
    this.selectedBackup = undefined;
    this.restorePreview = undefined;
    this.previewLoading = false;
    this.previewError = '';
    this.restoreBusy = false;
    this.restoreError = '';
    this.selectedOperation = undefined;
    this.restoreDetailsExpanded = false;
    this.restoreScope = 'full';
    this.resetRestoreDecision();
  }

  private resetRestoreDecision(): void {
    this.duplicateStrategy = '';
    this.roleResolutions = {};
    this.restoreConfirmed = false;
    this.roleLimitAcknowledged = false;
    this.restoreIdempotencyKey = '';
    this.restoreError = '';
  }

  private buildRestoreDecision(): BackupRestoreDecision {
    if (!(this.restorePreview?.ambiguousRoles.length)) return {};
    if (this.duplicateStrategy === 'merge') {
      return { duplicateStrategy: 'merge', roleResolutions: {} };
    }
    return {
      duplicateStrategy: 'explicit',
      roleResolutions: { ...this.roleResolutions }
    };
  }

  private finishSettingsSave(): void {
    this.settingsSaving = false;
    this.savingChange.emit(
      this.createBusy || this.restoreBusy || this.deleteBusyId != null
    );
  }

  private finishCreate(): void {
    this.createBusy = false;
    this.savingChange.emit(
      this.settingsSaving || this.restoreBusy || this.deleteBusyId != null
    );
  }

  private finishRestoreStart(): void {
    this.restoreBusy = false;
    this.savingChange.emit(
      this.settingsSaving || this.createBusy || this.deleteBusyId != null
    );
  }

  private finishDelete(): void {
    this.deleteBusyId = undefined;
    this.savingChange.emit(
      this.settingsSaving || this.createBusy || this.restoreBusy
    );
  }

  isActiveOperation(
    operation: { status: BackupOperationStatus }
  ): boolean {
    return operation.status === 'PENDING' || operation.status === 'RUNNING';
  }

  private isRecentTerminalOperation(
    operation: {
      status: BackupOperationStatus;
      finishedAt: string | null;
      createdAt: string | null;
    }
  ): boolean {
    if (this.isActiveOperation(operation)) return false;
    const finished = operation.finishedAt || operation.createdAt;
    if (!finished) return false;
    const timestamp = new Date(finished).getTime();
    return Number.isFinite(timestamp)
      && Date.now() - timestamp < this.terminalOperationVisibilityMs;
  }

  private operationSessionKey(operationId: number): string {
    return `${this.guildId}:${operationId}`;
  }

  private isRecentSnapshotOperation(operation: BackupSnapshotOperation): boolean {
    return !this.dismissedSnapshotOperationIds.has(
      this.operationSessionKey(operation.id)
    ) && this.isRecentTerminalOperation(operation);
  }

  private isRecentRestoreOperation(operation: BackupRestoreOperation): boolean {
    return !this.dismissedRestoreOperationIds.has(
      this.operationSessionKey(operation.id)
    ) && this.isRecentTerminalOperation(operation);
  }

  private operationExpiryDelay(
    operation:
      | BackupSnapshotOperation
      | BackupRestoreOperation
      | undefined
  ): number | null {
    if (!operation || this.isActiveOperation(operation)) return null;
    const finished = operation.finishedAt || operation.createdAt;
    if (!finished) return null;
    const timestamp = new Date(finished).getTime();
    if (!Number.isFinite(timestamp)) return null;
    return timestamp + this.terminalOperationVisibilityMs - Date.now();
  }

  private scheduleOperationExpiry(): void {
    if (this.operationVisibilityTimer) {
      clearTimeout(this.operationVisibilityTimer);
      this.operationVisibilityTimer = undefined;
    }

    const snapshotDelay = this.operationExpiryDelay(this.selectedSnapshotOperation);
    const restoreDelay = this.operationExpiryDelay(this.selectedOperation);

    if (snapshotDelay != null && snapshotDelay <= 0) {
      this.selectedSnapshotOperation = undefined;
      this.snapshotDetailsExpanded = false;
    }
    if (restoreDelay != null && restoreDelay <= 0) {
      this.selectedOperation = undefined;
      this.restoreDetailsExpanded = false;
    }

    const positiveDelays = [
      this.operationExpiryDelay(this.selectedSnapshotOperation),
      this.operationExpiryDelay(this.selectedOperation)
    ].filter((delay): delay is number => delay != null && delay > 0);

    if (!positiveDelays.length) return;
    this.operationVisibilityTimer = setTimeout(() => {
      this.scheduleOperationExpiry();
    }, Math.min(...positiveDelays) + 50);
  }

  private emitDirty(value: boolean): void {
    this.dirtyChange.emit(value);
  }

  private newIdempotencyKey(): string {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    return 'backup-' + Date.now() + '-' + Math.random().toString(16).slice(2);
  }

  private errorMessage(error: any, fallback: string): string {
    return error?.error?.message || error?.error?.detail || fallback;
  }
}
