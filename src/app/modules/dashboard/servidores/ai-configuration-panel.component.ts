import { Component, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges } from '@angular/core';

import {
  AiConfigResponse,
  AiConfigUpdateRequest,
  GuildChannel,
  ManagedServersService
} from '../../../core/services/managed-servers.service';

@Component({
  selector: 'app-ai-configuration-panel',
  standalone: false,
  templateUrl: './ai-configuration-panel.component.html',
  styleUrl: './ai-configuration-panel.component.scss'
})
export class AiConfigurationPanelComponent implements OnChanges, OnDestroy {
  @Input() guildId = '';
  @Input() channels: GuildChannel[] = [];
  @Output() dirtyChange = new EventEmitter<boolean>();
  @Output() savingChange = new EventEmitter<boolean>();

  persisted?: AiConfigResponse;
  draft?: AiConfigResponse;
  loading = false;
  saving = false;
  error = '';
  saveMessage = '';

  tokenInput = '';
  tokenBusy = false;
  tokenError = '';
  tokenMessage = '';
  confirmTokenRemoval = false;

  adminUserIdsText = '';
  channelToAdd = '';

  // Curated text-model IDs compatible with Coddy's OpenAI Responses workflow.
  // Access to each model is still verified by the API using this guild's key.
  readonly aiModelOptions: ReadonlyArray<{ id: string; label: string }> = [
    { id: 'gpt-6-luna', label: 'GPT-6 Luna — econômico e rápido' },
    { id: 'gpt-6.1-terra', label: 'GPT-6.1 Terra — rápido e versátil' },
    { id: 'gpt-6.1-sol', label: 'GPT-6.1 Sol — avançado e equilibrado' },
    { id: 'gpt-6-astra', label: 'GPT-6 Astra — máximo desempenho' },
    { id: 'gpt-5.6-luna', label: 'GPT-5.6 Luna — geração anterior' },
    { id: 'gpt-5.6-terra', label: 'GPT-5.6 Terra — geração anterior' },
    { id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol — geração anterior' }
  ];

  get legacySelectedModel(): string | null {
    const selected = this.draft?.model ?? '';
    return selected && !this.aiModelOptions.some(option => option.id === selected)
      ? selected : null;
  }

  private loadGeneration = 0;
  private draftRevision = 0;

  constructor(private readonly service: ManagedServersService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['guildId']) this.load();
  }

  ngOnDestroy(): void {
    this.loadGeneration++;
    this.dirtyChange.emit(false);
    this.savingChange.emit(false);
  }

  get messageChannels(): GuildChannel[] {
    return this.channels.filter(channel => channel.type === 'text' || channel.type === 'news');
  }

  get availableMessageChannels(): GuildChannel[] {
    const selected = new Set(this.draft?.channelIds ?? []);
    return this.messageChannels.filter(channel => !selected.has(channel.id));
  }

  get dirty(): boolean {
    if (!this.persisted || !this.draft) return false;
    return JSON.stringify(this.editable(this.persisted)) !== JSON.stringify(this.editable(this.draft));
  }

  get canSave(): boolean {
    return !!this.draft
      && this.dirty
      && !this.saving
      && !this.tokenBusy
      && (!this.draft.channelLimitEnabled || this.draft.channelIds.length > 0);
  }

  load(): void {
    const guildId = this.guildId;
    const generation = ++this.loadGeneration;
    this.persisted = undefined;
    this.draft = undefined;
    this.loading = !!guildId;
    this.error = '';
    this.saveMessage = '';
    this.tokenInput = '';
    this.tokenError = '';
    this.tokenMessage = '';
    this.confirmTokenRemoval = false;
    this.adminUserIdsText = '';
    this.channelToAdd = '';
    this.emitDirty(false);

    if (!guildId) {
      this.loading = false;
      return;
    }

    this.service.getAi(guildId).subscribe({
      next: config => {
        if (generation !== this.loadGeneration || guildId !== this.guildId) return;
        this.persisted = structuredClone(config);
        this.draft = structuredClone(config);
        this.adminUserIdsText = config.adminUserIds.join('\n');
        this.draftRevision = 0;
        this.loading = false;
        this.emitDirty(false);
      },
      error: error => {
        if (generation !== this.loadGeneration || guildId !== this.guildId) return;
        this.error = this.errorMessage(error, 'Não foi possível carregar a configuração de IA.');
        this.loading = false;
      }
    });
  }

  onDraftChanged(): void {
    this.draftRevision++;
    this.saveMessage = '';
    this.emitDirty(this.dirty);
  }

  updateAdminUserIds(raw: string): void {
    this.adminUserIdsText = raw;
    if (!this.draft) return;
    this.draft.adminUserIds = this.parseIdList(raw);
    this.onDraftChanged();
  }

  addChannel(channelId: string): void {
    this.channelToAdd = '';
    if (!this.draft || !channelId) return;
    if (!this.messageChannels.some(channel => channel.id === channelId)) return;
    if (this.draft.channelIds.includes(channelId)) return;

    this.draft.channelIds = [...this.draft.channelIds, channelId];
    this.onDraftChanged();
  }

  removeChannel(channelId: string): void {
    if (!this.draft || !this.draft.channelIds.includes(channelId)) return;
    this.draft.channelIds = this.draft.channelIds.filter(id => id !== channelId);
    this.onDraftChanged();
  }

  channelName(channelId: string): string | null {
    return this.messageChannels.find(channel => channel.id === channelId)?.name ?? null;
  }

  channelUnavailable(channelId: string): boolean {
    return !this.messageChannels.some(channel => channel.id === channelId);
  }

  resetDraft(): void {
    if (!this.persisted || this.saving || this.tokenBusy) return;
    this.draft = structuredClone(this.persisted);
    this.adminUserIdsText = this.draft.adminUserIds.join('\n');
    this.channelToAdd = '';
    this.draftRevision++;
    this.saveMessage = '';
    this.error = '';
    this.emitDirty(false);
  }

  save(): void {
    if (!this.draft || !this.canSave) return;

    const guildId = this.guildId;
    const submittedRevision = this.draftRevision;
    const request: AiConfigUpdateRequest = {
      enabled: this.draft.enabled,
      model: this.draft.model,
      channelLimitEnabled: this.draft.channelLimitEnabled,
      channelIds: [...this.draft.channelIds],
      adminChannelBypassEnabled: this.draft.adminChannelBypassEnabled,
      adminUserIds: [...this.draft.adminUserIds]
    };

    this.saving = true;
    this.error = '';
    this.saveMessage = '';
    this.savingChange.emit(true);

    this.service.updateAi(guildId, request).subscribe({
      next: config => {
        if (guildId !== this.guildId) return this.finishSave();
        this.persisted = structuredClone(config);

        if (submittedRevision === this.draftRevision) {
          this.draft = structuredClone(config);
          this.adminUserIdsText = config.adminUserIds.join('\n');
          this.saveMessage = 'Configuração de IA salva.';
        } else {
          this.saveMessage = 'Configuração salva; alterações feitas durante o salvamento continuam não salvas.';
        }
        this.finishSave();
        this.emitDirty(this.dirty);
      },
      error: error => {
        if (guildId === this.guildId) this.error = this.errorMessage(error, 'Não foi possível salvar a configuração de IA.');
        this.finishSave();
      }
    });
  }

  rotateToken(): void {
    const token = this.tokenInput.trim();
    if (!token || this.tokenBusy || this.saving) return;

    const guildId = this.guildId;
    this.tokenBusy = true;
    this.tokenError = '';
    this.tokenMessage = '';
    this.confirmTokenRemoval = false;
    this.savingChange.emit(true);

    this.service.rotateAiToken(guildId, token).subscribe({
      next: status => {
        if (guildId === this.guildId) {
          this.patchTokenMetadata(status.configured, status.updatedAt);
          this.tokenInput = '';
          this.tokenMessage = 'Chave OpenAI validada e substituída com sucesso.';
        }
        this.finishTokenMutation();
      },
      error: error => {
        if (guildId === this.guildId) this.tokenError = this.errorMessage(error, 'Não foi possível validar e substituir a chave OpenAI.');
        this.finishTokenMutation();
      }
    });
  }

  requestTokenRemoval(): void {
    if (!this.draft?.tokenConfigured || this.tokenBusy || this.saving) return;
    this.confirmTokenRemoval = true;
    this.tokenError = '';
    this.tokenMessage = '';
  }

  cancelTokenRemoval(): void {
    this.confirmTokenRemoval = false;
  }

  removeToken(): void {
    if (!this.confirmTokenRemoval || this.tokenBusy || this.saving) return;

    const guildId = this.guildId;
    this.tokenBusy = true;
    this.tokenError = '';
    this.tokenMessage = '';
    this.savingChange.emit(true);

    this.service.removeAiToken(guildId).subscribe({
      next: status => {
        if (guildId === this.guildId) {
          this.patchTokenMetadata(status.configured, status.updatedAt);
          this.tokenInput = '';
          this.confirmTokenRemoval = false;
          this.tokenMessage = 'Chave OpenAI removida.';
        }
        this.finishTokenMutation();
      },
      error: error => {
        if (guildId === this.guildId) this.tokenError = this.errorMessage(error, 'Não foi possível remover a chave OpenAI.');
        this.finishTokenMutation();
      }
    });
  }

  private patchTokenMetadata(configured: boolean, updatedAt: string | null): void {
    if (this.persisted) {
      this.persisted.tokenConfigured = configured;
      this.persisted.tokenUpdatedAt = updatedAt;
    }
    if (this.draft) {
      this.draft.tokenConfigured = configured;
      this.draft.tokenUpdatedAt = updatedAt;
    }
  }

  private editable(config: AiConfigResponse): AiConfigUpdateRequest {
    return {
      enabled: config.enabled,
      model: config.model,
      channelLimitEnabled: config.channelLimitEnabled,
      channelIds: [...config.channelIds].sort(),
      adminChannelBypassEnabled: config.adminChannelBypassEnabled,
      adminUserIds: [...config.adminUserIds].sort()
    };
  }

  private parseIdList(raw: string): string[] {
    return [...new Set(raw.split(/[\s,]+/).map(value => value.trim()).filter(Boolean))];
  }

  private finishSave(): void {
    this.saving = false;
    this.savingChange.emit(this.tokenBusy);
  }

  private finishTokenMutation(): void {
    this.tokenBusy = false;
    this.savingChange.emit(this.saving);
  }

  private emitDirty(value: boolean): void {
    this.dirtyChange.emit(value);
  }

  private errorMessage(error: any, fallback: string): string {
    return error?.error?.message || error?.error?.detail || fallback;
  }
}
