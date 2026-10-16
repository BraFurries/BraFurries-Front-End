import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges
} from '@angular/core';
import { Observable, Subscription, exhaustMap, forkJoin, of, switchMap, tap, timer } from 'rxjs';

import {
  ManagedServerThemesService,
  Theme,
  ThemeApplication,
  ThemeAssetAction,
  ThemeEditableRole,
  ThemeOperation,
  ThemePreview,
  ThemeResourceRequest,
  ThemeResourceType,
  ThemeResources,
  ThemeSaveRequest,
  ThemesResponse
} from '../../../core/services/managed-server-themes.service';

interface ThemeDraft {
  id: number | null;
  name: string;
  description: string;
  iconAction: ThemeAssetAction;
  bannerAction: ThemeAssetAction;
  resources: ThemeResourceRequest[];
}

interface ResourceOption {
  id: string;
  name: string;
  eligible: boolean;
  unavailableReason: string | null;
}

@Component({
  selector: 'app-theme-management-panel',
  standalone: false,
  templateUrl: './theme-management-panel.component.html',
  styleUrl: './theme-management-panel.component.scss'
})
export class ThemeManagementPanelComponent implements OnChanges, OnDestroy {
  @Input() guildId = '';
  @Output() dirtyChange = new EventEmitter<boolean>();
  @Output() savingChange = new EventEmitter<boolean>();

  catalog?: ThemesResponse;
  resources?: ThemeResources;
  draft: ThemeDraft = this.emptyDraft();
  preview?: ThemePreview;
  operation?: ThemeOperation;

  loading = false;
  error = '';
  mutationError = '';
  mutationMessage = '';
  mutationBusy = false;

  iconFile?: File;
  bannerFile?: File;
  newResourceType: ThemeResourceType = 'CHANNEL';
  newResourceId = '';

  applyConfirmed = false;
  restoreConfirmed = false;
  forceRestore = false;
  deleteCandidate?: Theme;

  private baseline = JSON.stringify(this.emptyDraft());
  private generation = 0;
  private operationPoll?: Subscription;
  private applyAttempt?: { context: string; key: string };
  private restoreAttempt?: { context: string; key: string };

  constructor(private readonly service: ManagedServerThemesService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['guildId']) this.load();
  }

  ngOnDestroy(): void {
    this.generation++;
    this.operationPoll?.unsubscribe();
    this.dirtyChange.emit(false);
    this.savingChange.emit(false);
  }

  get themes(): Theme[] {
    return this.catalog?.themes ?? [];
  }

  get activeApplication(): ThemeApplication | null {
    return this.catalog?.activeApplication ?? null;
  }

  get currentTheme(): Theme | undefined {
    return this.draft.id == null
      ? undefined
      : this.themes.find(theme => theme.id === this.draft.id);
  }

  get dirty(): boolean {
    return JSON.stringify(this.draft) !== this.baseline || !!this.iconFile || !!this.bannerFile;
  }

  get canSave(): boolean {
    return this.dirty
      && !this.mutationBusy
      && !!this.draft.name.trim()
      && this.draft.resources.every(resource => !!resource.targetName.trim())
      && this.assetReady('icon')
      && this.assetReady('banner');
  }

  get canPreview(): boolean {
    return this.draft.id != null && !this.dirty && !this.mutationBusy;
  }

  get canApply(): boolean {
    return !!this.preview?.ready
      && this.preview.themeId === this.draft.id
      && !this.activeApplication
      && this.applyConfirmed
      && !this.mutationBusy
      && !this.dirty;
  }

  get canRestore(): boolean {
    return !!this.activeApplication
      && this.restoreConfirmed
      && !this.mutationBusy
      && !this.isOperationActive(this.activeApplication.latestOperation);
  }

  get activeThemeId(): number | null {
    return this.activeApplication?.themeId ?? null;
  }

  load(): void {
    const guildId = this.guildId;
    const generation = ++this.generation;
    this.operationPoll?.unsubscribe();
    this.loading = !!guildId;
    this.error = '';
    this.mutationError = '';
    this.mutationMessage = '';
    this.catalog = undefined;
    this.resources = undefined;
    this.operation = undefined;
    this.deleteCandidate = undefined;
    this.restoreConfirmed = false;
    this.forceRestore = false;
    this.applyAttempt = undefined;
    this.restoreAttempt = undefined;
    this.resetEditor();
    this.emitDirty();

    if (!guildId) {
      this.loading = false;
      return;
    }

    forkJoin({
      catalog: this.service.listThemes(guildId),
      resources: this.service.getResources(guildId)
    }).subscribe({
      next: response => {
        if (guildId !== this.guildId || generation !== this.generation) return;
        this.catalog = response.catalog;
        this.resources = response.resources;
        const preferred = response.catalog.activeApplication?.themeId
          ?? response.catalog.themes[0]?.id;
        if (preferred != null) this.selectThemeInternal(preferred);
        this.loading = false;
        const activeOperation = response.catalog.activeApplication?.latestOperation;
        if (response.catalog.activeApplication && this.isOperationActive(activeOperation)) {
          this.operation = activeOperation ?? undefined;
          this.startApplicationPolling(response.catalog.activeApplication.id);
        }
      },
      error: error => {
        if (guildId !== this.guildId || generation !== this.generation) return;
        this.error = this.errorMessage(error, 'Não foi possível carregar os Temas Temporários.');
        this.loading = false;
      }
    });
  }

  startNewTheme(): void {
    if (this.dirty || this.mutationBusy) return;
    this.preview = undefined;
    this.operation = undefined;
    this.deleteCandidate = undefined;
    this.resetEditor();
  }

  selectTheme(themeId: number): void {
    if (this.mutationBusy || (this.dirty && this.draft.id !== themeId)) return;
    this.selectThemeInternal(themeId);
  }

  discardChanges(): void {
    if (this.mutationBusy) return;
    if (this.draft.id == null) {
      this.resetEditor();
      return;
    }
    this.selectThemeInternal(this.draft.id);
  }

  onDraftChanged(): void {
    this.preview = undefined;
    this.applyConfirmed = false;
    this.applyAttempt = undefined;
    this.mutationMessage = '';
    this.emitDirty();
  }

  onAssetFile(kind: 'icon' | 'banner', file: File | null | undefined): void {
    if (kind === 'icon') this.iconFile = file ?? undefined;
    else this.bannerFile = file ?? undefined;
    this.onDraftChanged();
  }

  clearAssetFile(kind: 'icon' | 'banner'): void {
    if (kind === 'icon') this.iconFile = undefined;
    else this.bannerFile = undefined;
    this.onDraftChanged();
  }

  resourceOptions(type: ThemeResourceType = this.newResourceType): ResourceOption[] {
    if (!this.resources) return [];
    if (type === 'CHANNEL') {
      return this.resources.channels.map(item => ({
        id: item.id,
        name: item.name,
        eligible: true,
        unavailableReason: null
      }));
    }
    if (type === 'CATEGORY') {
      return this.resources.categories.map(item => ({
        id: item.id,
        name: item.name,
        eligible: true,
        unavailableReason: null
      }));
    }
    return this.resources.roles
      .slice()
      .sort((a, b) => (b.position ?? -1) - (a.position ?? -1))
      .map((role: ThemeEditableRole) => ({
        id: role.id,
        name: role.name,
        eligible: role.eligible,
        unavailableReason: role.unavailableReason
      }));
  }

  resourceAlreadyAdded(resourceId: string): boolean {
    return this.draft.resources.some(item =>
      item.resourceType === this.newResourceType && item.resourceId === resourceId
    );
  }

  onResourceTypeChanged(): void {
    this.newResourceId = '';
  }

  addResource(): void {
    const option = this.resourceOptions().find(item => item.id === this.newResourceId);
    if (!option || !option.eligible || this.resourceAlreadyAdded(option.id)) return;

    this.draft.resources.push({
      resourceType: this.newResourceType,
      resourceId: option.id,
      targetName: option.name
    });
    this.newResourceId = '';
    this.onDraftChanged();
  }

  removeResource(index: number): void {
    this.draft.resources.splice(index, 1);
    this.onDraftChanged();
  }

  resourceOriginalName(resource: ThemeResourceRequest): string {
    return this.resourceOptions(resource.resourceType)
      .find(item => item.id === resource.resourceId)?.name
      ?? ('ID ' + resource.resourceId);
  }

  resourceTypeLabel(type: ThemeResourceType): string {
    return type === 'CHANNEL' ? 'Canal' : type === 'CATEGORY' ? 'Categoria' : 'Cargo';
  }

  saveTheme(): void {
    if (!this.canSave) return;
    const guildId = this.guildId;
    const generation = this.generation;
    const request = this.buildRequest();
    const existingId = this.draft.id;
    const icon = this.iconFile;
    const banner = this.bannerFile;

    this.beginMutation();
    let savedThemeId: number | undefined;

    let request$: Observable<Theme>;
    if (existingId == null) {
      request$ = this.service.createTheme(guildId, request).pipe(
        tap(theme => savedThemeId = theme.id),
        switchMap(theme => icon && request.iconAction === 'SET'
          ? this.service.uploadAsset(guildId, theme.id, 'ICON', icon)
          : of(theme)
        ),
        switchMap(theme => banner && request.bannerAction === 'SET'
          ? this.service.uploadAsset(guildId, theme.id, 'BANNER', banner)
          : of(theme)
        )
      );
    } else {
      savedThemeId = existingId;
      const persisted = this.currentTheme;
      request$ = persisted ? of(persisted) : this.service.listThemes(guildId).pipe(
        switchMap(catalog => {
          const theme = catalog.themes.find(item => item.id === existingId);
          if (!theme) throw new Error('Theme selecionado não existe mais.');
          return of(theme);
        })
      );
      request$ = request$.pipe(
        switchMap(theme => icon && request.iconAction === 'SET'
          ? this.service.uploadAsset(guildId, theme.id, 'ICON', icon)
          : of(theme)
        ),
        switchMap(theme => banner && request.bannerAction === 'SET'
          ? this.service.uploadAsset(guildId, theme.id, 'BANNER', banner)
          : of(theme)
        ),
        switchMap(() => this.service.updateTheme(guildId, existingId, request))
      );
    }

    request$.subscribe({
      next: theme => {
        if (guildId !== this.guildId || generation !== this.generation) return;
        this.finishMutation();
        this.mutationMessage = existingId == null ? 'Tema criado.' : 'Tema salvo.';
        this.refreshCatalog(theme.id);
      },
      error: error => {
        if (guildId !== this.guildId || generation !== this.generation) return;
        this.finishMutation();
        this.mutationError = this.errorMessage(error, 'Não foi possível salvar o Tema.');
        if (savedThemeId != null) this.refreshCatalog(savedThemeId);
      }
    });
  }

  requestDelete(theme: Theme | undefined): void {
    if (!theme || this.mutationBusy || this.dirty || this.activeThemeId === theme.id) return;
    this.deleteCandidate = theme;
    this.mutationError = '';
  }

  cancelDelete(): void {
    if (!this.mutationBusy) this.deleteCandidate = undefined;
  }

  confirmDelete(): void {
    const candidate = this.deleteCandidate;
    if (!candidate || this.mutationBusy || this.activeThemeId === candidate.id) return;
    const guildId = this.guildId;
    const generation = this.generation;
    this.beginMutation();

    this.service.deleteTheme(guildId, candidate.id).subscribe({
      next: () => {
        if (guildId !== this.guildId || generation !== this.generation) return;
        const deletedSelected = this.draft.id === candidate.id;
        this.deleteCandidate = undefined;
        this.finishMutation();
        this.mutationMessage = 'Tema excluído.';
        this.refreshCatalog(deletedSelected ? undefined : this.draft.id ?? undefined);
      },
      error: error => {
        if (guildId !== this.guildId || generation !== this.generation) return;
        this.finishMutation();
        this.mutationError = this.errorMessage(error, 'Não foi possível excluir o Tema.');
      }
    });
  }

  previewTheme(): void {
    if (!this.canPreview || this.draft.id == null) return;
    const guildId = this.guildId;
    const themeId = this.draft.id;
    const generation = this.generation;
    this.beginMutation();
    this.applyConfirmed = false;

    this.service.previewTheme(guildId, themeId).subscribe({
      next: preview => {
        if (guildId !== this.guildId || generation !== this.generation) return;
        this.preview = preview;
        this.finishMutation();
      },
      error: error => {
        if (guildId !== this.guildId || generation !== this.generation) return;
        this.finishMutation();
        this.mutationError = this.errorMessage(error, 'Não foi possível gerar o preview do Tema.');
      }
    });
  }

  applyTheme(): void {
    if (!this.canApply || this.draft.id == null) return;
    const guildId = this.guildId;
    const themeId = this.draft.id;
    const generation = this.generation;
    const idempotencyKey = this.operationIdempotencyKey(
      'apply',
      guildId + ':' + themeId
    );
    this.beginMutation();

    this.service.applyTheme(guildId, themeId, idempotencyKey).subscribe({
      next: operation => {
        if (guildId !== this.guildId || generation !== this.generation) return;
        this.applyAttempt = undefined;
        this.operation = operation;
        this.applyConfirmed = false;
        this.finishMutation();
        this.mutationMessage = 'Aplicação enviada ao Coddy.';
        this.startApplicationPolling(operation.applicationId);
      },
      error: error => {
        if (guildId !== this.guildId || generation !== this.generation) return;
        this.finishMutation();
        this.mutationError = this.errorMessage(error, 'Não foi possível aplicar o Tema.');
      }
    });
  }

  restoreTheme(): void {
    const application = this.activeApplication;
    if (!application || !this.canRestore) return;
    const guildId = this.guildId;
    const generation = this.generation;
    const force = this.forceRestore;
    const idempotencyKey = this.operationIdempotencyKey(
      'restore',
      guildId + ':' + application.id + ':' + force
    );
    this.beginMutation();

    this.service.restoreApplication(
      guildId,
      application.id,
      force,
      idempotencyKey
    ).subscribe({
      next: operation => {
        if (guildId !== this.guildId || generation !== this.generation) return;
        this.restoreAttempt = undefined;
        this.operation = operation;
        this.restoreConfirmed = false;
        this.finishMutation();
        this.mutationMessage = force
          ? 'Restauração forçada enviada ao Coddy.'
          : 'Restauração enviada ao Coddy.';
        this.startApplicationPolling(application.id);
      },
      error: error => {
        if (guildId !== this.guildId || generation !== this.generation) return;
        this.finishMutation();
        this.mutationError = this.errorMessage(error, 'Não foi possível restaurar o Tema.');
      }
    });
  }

  isOperationActive(operation: ThemeOperation | null | undefined): boolean {
    return operation?.status === 'PENDING' || operation?.status === 'RUNNING';
  }

  operationProgress(operation: ThemeOperation | null | undefined): number {
    if (!operation) return 0;
    if (operation.progressTotal <= 0) return this.isOperationActive(operation) ? 5 : 100;
    return Math.max(
      0,
      Math.min(100, Math.round((operation.progressCurrent / operation.progressTotal) * 100))
    );
  }

  statusLabel(status: string | null | undefined): string {
    const labels: Record<string, string> = {
      PENDING: 'Aguardando',
      RUNNING: 'Executando',
      SUCCEEDED: 'Concluída',
      PARTIAL: 'Parcial',
      FAILED: 'Falhou',
      APPLYING: 'Aplicando',
      ACTIVE: 'Ativo',
      APPLY_PARTIAL: 'Aplicação parcial',
      RESTORING: 'Restaurando',
      RESTORED: 'Restaurado',
      RESTORE_PARTIAL: 'Restauração parcial'
    };
    return labels[String(status ?? '').toUpperCase()] ?? (status || 'Desconhecido');
  }

  stepStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      PENDING: 'Aguardando',
      RUNNING: 'Executando',
      SUCCEEDED: 'OK',
      SKIPPED: 'Ignorado',
      FAILED: 'Falhou',
      DRIFTED: 'Drift',
      MISSING: 'Ausente'
    };
    return labels[status] ?? status;
  }

  formatDate(value: string | null | undefined): string {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString('pt-BR');
  }

  assetFileName(kind: 'icon' | 'banner'): string {
    return (kind === 'icon' ? this.iconFile : this.bannerFile)?.name ?? '';
  }

  assetRequirementMessage(kind: 'icon' | 'banner'): string {
    const action = kind === 'icon' ? this.draft.iconAction : this.draft.bannerAction;
    if (action !== 'SET' || this.assetReady(kind)) return '';
    return kind === 'icon'
      ? 'Selecione um arquivo de ícone para usar SET.'
      : 'Selecione um arquivo de banner para usar SET.';
  }

  private assetReady(kind: 'icon' | 'banner'): boolean {
    const action = kind === 'icon' ? this.draft.iconAction : this.draft.bannerAction;
    if (action !== 'SET') return true;
    const file = kind === 'icon' ? this.iconFile : this.bannerFile;
    if (file) return true;
    const persisted = kind === 'icon' ? this.currentTheme?.icon : this.currentTheme?.banner;
    return persisted?.action === 'SET' && !!persisted.sha256;
  }

  private selectThemeInternal(themeId: number): void {
    const theme = this.themes.find(item => item.id === themeId);
    if (!theme) {
      this.resetEditor();
      return;
    }
    this.draft = {
      id: theme.id,
      name: theme.name,
      description: theme.description ?? '',
      iconAction: theme.icon.action,
      bannerAction: theme.banner.action,
      resources: theme.resources.map(resource => ({
        resourceType: resource.resourceType,
        resourceId: resource.resourceId,
        targetName: resource.targetName
      }))
    };
    this.iconFile = undefined;
    this.bannerFile = undefined;
    this.preview = undefined;
    this.applyConfirmed = false;
    this.applyAttempt = undefined;
    this.deleteCandidate = undefined;
    this.baseline = JSON.stringify(this.draft);
    this.emitDirty();
  }

  private resetEditor(): void {
    this.draft = this.emptyDraft();
    this.iconFile = undefined;
    this.bannerFile = undefined;
    this.newResourceType = 'CHANNEL';
    this.newResourceId = '';
    this.preview = undefined;
    this.applyConfirmed = false;
    this.applyAttempt = undefined;
    this.deleteCandidate = undefined;
    this.baseline = JSON.stringify(this.draft);
    this.emitDirty();
  }

  private emptyDraft(): ThemeDraft {
    return {
      id: null,
      name: '',
      description: '',
      iconAction: 'UNCHANGED',
      bannerAction: 'UNCHANGED',
      resources: []
    };
  }

  private buildRequest(): ThemeSaveRequest {
    return {
      name: this.draft.name.trim(),
      description: this.draft.description.trim(),
      iconAction: this.draft.iconAction,
      bannerAction: this.draft.bannerAction,
      resources: this.draft.resources.map(resource => ({
        resourceType: resource.resourceType,
        resourceId: resource.resourceId,
        targetName: resource.targetName.trim()
      }))
    };
  }

  private refreshCatalog(preferredThemeId?: number): void {
    const guildId = this.guildId;
    const generation = this.generation;
    this.service.listThemes(guildId).subscribe({
      next: catalog => {
        if (guildId !== this.guildId || generation !== this.generation) return;
        this.catalog = catalog;
        const preferred = preferredThemeId
          ?? catalog.activeApplication?.themeId
          ?? catalog.themes[0]?.id;
        if (preferred != null && catalog.themes.some(theme => theme.id === preferred)) {
          this.selectThemeInternal(preferred);
        } else {
          this.resetEditor();
        }
        if (catalog.activeApplication?.latestOperation) {
          this.operation = catalog.activeApplication.latestOperation;
        }
      },
      error: error => {
        if (guildId !== this.guildId || generation !== this.generation) return;
        this.mutationError = this.errorMessage(error, 'O Tema foi alterado, mas não foi possível atualizar o catálogo.');
      }
    });
  }

  private startApplicationPolling(applicationId: number): void {
    const guildId = this.guildId;
    const generation = this.generation;
    this.operationPoll?.unsubscribe();
    this.operationPoll = timer(0, 1500).pipe(
      exhaustMap(() => this.service.getApplication(guildId, applicationId))
    ).subscribe({
      next: application => {
        if (guildId !== this.guildId || generation !== this.generation) return;
        this.catalog = {
          themes: this.catalog?.themes ?? [],
          activeApplication: application.status === 'RESTORED' ? null : application
        };
        this.operation = application.latestOperation ?? this.operation;

        if (!this.isOperationActive(application.latestOperation)) {
          this.operationPoll?.unsubscribe();
          this.operationPoll = undefined;
          this.refreshCatalog(this.draft.id ?? application.themeId);
        }
      },
      error: error => {
        if (guildId !== this.guildId || generation !== this.generation) return;
        this.operationPoll?.unsubscribe();
        this.operationPoll = undefined;
        this.mutationError = this.errorMessage(error, 'Não foi possível acompanhar a operação do Tema.');
      }
    });
  }

  private beginMutation(): void {
    this.mutationBusy = true;
    this.mutationError = '';
    this.mutationMessage = '';
    this.savingChange.emit(true);
  }

  private finishMutation(): void {
    this.mutationBusy = false;
    this.savingChange.emit(false);
  }

  private emitDirty(): void {
    this.dirtyChange.emit(this.dirty);
  }

  private operationIdempotencyKey(kind: 'apply' | 'restore', context: string): string {
    const current = kind === 'apply' ? this.applyAttempt : this.restoreAttempt;
    if (current?.context === context) return current.key;

    const prefix = kind === 'apply' ? 'theme-apply' : 'theme-restore';
    const attempt = { context, key: this.newIdempotencyKey(prefix) };
    if (kind === 'apply') this.applyAttempt = attempt;
    else this.restoreAttempt = attempt;
    return attempt.key;
  }

  private newIdempotencyKey(prefix: string): string {
    if (globalThis.crypto?.randomUUID) return prefix + '-' + globalThis.crypto.randomUUID();
    return prefix + '-' + Date.now() + '-' + Math.random().toString(16).slice(2);
  }

  private errorMessage(error: any, fallback: string): string {
    return error?.error?.message || error?.error?.detail || fallback;
  }
}
