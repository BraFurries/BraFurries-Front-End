import { Component, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges } from '@angular/core';
import { finalize, firstValueFrom, switchMap } from 'rxjs';
import { GuildCategory, GuildChannel, GuildResources } from '../../../core/services/managed-servers.service';
import {
  PartnerDiscordItem,
  PartnerDiscordOptionRequest,
  PartnerDiscordService,
  PartnerDiscordSettings
} from '../../../core/services/partner-discord.service';

@Component({
  selector: 'app-partner-discord-panel',
  standalone: false,
  templateUrl: './partner-discord-panel.component.html',
  styleUrls: ['./partner-discord-panel.component.scss']
})
export class PartnerDiscordPanelComponent implements OnChanges, OnDestroy {
  @Input() guildId = '';
  @Input() resources?: GuildResources;
  @Output() dirtyChange = new EventEmitter<boolean>();
  @Output() savingChange = new EventEmitter<boolean>();

  state?: PartnerDiscordSettings;
  categoryId = '';
  parentId = '';
  drafts: Record<number, PartnerDiscordOptionRequest> = {};
  loading = false;
  saving = false;
  error = '';
  success = '';
  busyPartnerId: number | null = null;
  withdrawalConfirmationId: number | null = null;
  private generation = 0;

  constructor(private readonly service: PartnerDiscordService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['guildId'] && this.guildId) this.load();
  }

  ngOnDestroy(): void {
    this.generation++;
    this.dirtyChange.emit(false);
    this.savingChange.emit(false);
  }

  get categories(): GuildCategory[] {
    return this.resources?.categories ?? [];
  }

  get parentChannels(): GuildChannel[] {
    if (!this.categoryId) return [];
    return (this.resources?.channels ?? []).filter(channel =>
      ['text', 'forum'].includes(channel.type)
      && (!this.categoryId || channel.categoryId === this.categoryId)
    );
  }

  get textChannels(): GuildChannel[] {
    return (this.resources?.channels ?? []).filter(channel =>
      channel.type === 'text'
      && (!this.categoryId || channel.categoryId === this.categoryId)
    );
  }

  get hasConfigChanges(): boolean {
    return !!this.state && (
      !this.state.configured || this.categoryId !== (this.state.categoryId ?? '')
      || this.parentId !== (this.state.threadParentChannelId ?? '')
    );
  }

  get dirty(): boolean {
    return this.hasConfigChanges || !!this.state?.partners.some(item =>
      this.partnerDirty(item)
    );
  }

  get canSaveAll(): boolean {
    if (!this.enabled || !this.dirty || this.loading || this.saving || this.busyPartnerId !== null) return false;
    return this.activePartners.every(item => {
      if (!this.partnerDirty(item)) return true;
      const draft = this.drafts[item.partnerId];
      return !!draft
        && (!draft.exclusiveChannelEnabled || !!item.representativeDiscordUserId)
        && (!draft.existingTextChannelId || draft.adoptExistingTextChannel);
    });
  }

  discard(): void {
    if (this.saving || this.busyPartnerId !== null || !this.state) return;
    this.apply(this.state);
    this.error = '';
    this.success = '';
  }

  get activePartners(): PartnerDiscordItem[] {
    return this.state?.partners.filter(item => item.status === 'active') ?? [];
  }

  get enabled(): boolean {
    return !!this.state && this.guildId === this.state.guildId;
  }

  partnerDirty(item: PartnerDiscordItem): boolean {
    const draft = this.drafts[item.partnerId];
    return !!draft && (
      draft.exclusiveChannelEnabled !== item.exclusiveChannelEnabled
      || draft.existingTextChannelId !== item.existingTextChannelId
      || draft.adoptExistingTextChannel !== item.adoptExistingTextChannel
    );
  }

  updateDraft(item: PartnerDiscordItem, changes: Partial<PartnerDiscordOptionRequest>): void {
    const current = this.drafts[item.partnerId] ?? this.toDraft(item);
    this.drafts[item.partnerId] = { ...current, ...changes };
    this.error = '';
    this.success = '';
    this.dirtyChange.emit(this.dirty);
  }

  onCategoryChanged(value: string): void {
    this.categoryId = value;
    if (this.parentId && !this.parentChannels.some(channel => channel.id === this.parentId)) {
      this.parentId = '';
    }
    this.dirtyChange.emit(this.dirty);
  }

  onParentChanged(value: string): void {
    this.parentId = value;
    this.dirtyChange.emit(this.dirty);
  }

  load(): void {
    const guild = this.guildId;
    const generation = ++this.generation;
    this.loading = true;
    this.error = '';
    this.success = '';
    this.state = undefined;
    this.drafts = {};
    this.withdrawalConfirmationId = null;
    this.dirtyChange.emit(false);
    this.service.getSettings().subscribe({
      next: settings => {
        if (guild !== this.guildId || generation !== this.generation) return;
        if (guild !== settings.guildId) {
          this.error = 'Esta integração é exclusiva do Discord oficial da BraFurries.';
        } else {
          this.apply(settings);
        }
        this.loading = false;
      },
      error: failure => {
        if (guild !== this.guildId || generation !== this.generation) return;
        this.error = failure?.status === 403
          ? 'Apenas responsáveis autorizados por parcerias podem configurar esta integração.'
          : failure?.error?.message || 'Não foi possível consultar a vitrine de parceiros.';
        this.loading = false;
      }
    });
  }

  /**
   * One user action persists each changed configuration in a deterministic order.
   * These are independent API writes, not one transaction; successful steps
   * update the baseline immediately and failed/remaining drafts remain dirty.
   */
  async saveAll(): Promise<void> {
    if (!this.canSaveAll || !this.state) return;
    const guild = this.guildId;
    const generation = this.generation;
    const categoryId = this.categoryId || null;
    const threadParentChannelId = this.parentId || null;
    const configDirty = this.hasConfigChanges;
    const changedPartners = this.activePartners
      .filter(item => this.partnerDirty(item))
      .map(item => ({ partnerId: item.partnerId, draft: { ...this.drafts[item.partnerId] } }));
    this.saving = true;
    this.savingChange.emit(true);
    this.error = '';
    this.success = '';
    try {
      if (configDirty) {
        const updatedConfig = await firstValueFrom(this.service.updateConfig({
          categoryId, threadParentChannelId
        }));
        if (generation !== this.generation || guild !== this.guildId) return;
        this.apply(updatedConfig);
        // Preserve unsaved partner options while adopting the canonical config.
        for (const item of changedPartners) {
          if (updatedConfig.partners.some(partner => partner.partnerId === item.partnerId)) {
            this.drafts[item.partnerId] = { ...item.draft };
          }
        }
        this.dirtyChange.emit(this.dirty);
      }
      if (changedPartners.length && !this.state.configured) {
        throw new Error('Configure o destino da vitrine antes de salvar os parceiros.');
      }
      for (const change of changedPartners) {
        if (generation !== this.generation || guild !== this.guildId) return;
        const persisted = await firstValueFrom(this.service.updatePartner(change.partnerId, change.draft));
        if (generation !== this.generation || guild !== this.guildId || !this.state) return;
        this.replaceSavedPartner(persisted);
        // Synchronization can fail independently: the persisted options remain
        // saved and can be reconciled using "Sincronizar todos".
        const applied = await firstValueFrom(this.service.syncPartner(change.partnerId));
        if (generation !== this.generation || guild !== this.guildId || !this.state) return;
        this.replaceSavedPartner(applied);
      }
      if (generation === this.generation && guild === this.guildId) {
        this.success = 'Configurações salvas. As publicações atualizadas foram enviadas para sincronização.';
      }
    } catch (failure: any) {
      if (generation === this.generation && guild === this.guildId) {
        this.error = (failure?.error?.message || failure?.message
          || 'Não foi possível concluir o salvamento da vitrine.')
          + ' As configurações restantes continuam pendentes. Caso a sincronização tenha falhado, use Sincronizar todos.';
      }
    } finally {
      this.finishSaving();
    }
  }

  private replaceSavedPartner(updated: PartnerDiscordItem): void {
    if (!this.state) return;
    this.state = {
      ...this.state,
      partners: this.state.partners.map(current =>
        current.partnerId === updated.partnerId ? updated : current)
    };
    this.drafts[updated.partnerId] = this.toDraft(updated);
    this.dirtyChange.emit(this.dirty);
  }

  requestWithdrawal(partnerId: number): void {
    this.withdrawalConfirmationId = partnerId;
    this.error = '';
    this.success = '';
  }

  cancelWithdrawal(): void {
    this.withdrawalConfirmationId = null;
  }

  confirmWithdrawal(item: PartnerDiscordItem): void {
    if (!this.enabled || this.saving || this.busyPartnerId !== null
      || this.withdrawalConfirmationId !== item.partnerId || this.dirty) return;
    const guild = this.guildId;
    this.busyPartnerId = item.partnerId;
    this.savingChange.emit(true);
    this.error = '';
    this.success = '';
    this.service.unpublishPartner(item.partnerId).pipe(
      switchMap(() => this.service.getSettings()),
      finalize(() => {
        this.busyPartnerId = null;
        this.savingChange.emit(false);
      })
    ).subscribe({
      next: settings => {
        if (guild !== this.guildId) return;
        this.apply(settings);
        this.withdrawalConfirmationId = null;
        this.success = 'Publicação retirada do Discord. O histórico foi preservado, e o cadastro poderá ser excluído separadamente.';
      },
      error: failure => {
        if (guild === this.guildId) {
          this.error = failure?.error?.message || 'Não foi possível retirar a divulgação do parceiro.';
        }
      }
    });
  }

  syncAll(): void {
    if (!this.enabled || !this.state?.configured || this.saving || this.busyPartnerId != null || this.dirty) return;
    const guild = this.guildId;
    this.saving = true;
    this.savingChange.emit(true);
    this.error = '';
    this.success = '';
    this.service.syncAll().pipe(
      switchMap(() => this.service.getSettings()),
      finalize(() => this.finishSaving())
    ).subscribe({
      next: state => {
        if (guild !== this.guildId) return;
        this.apply(state);
        const failures = state.partners.filter(item => !!item.lastSyncError);
        this.success = failures.length
          ? `Sincronização concluída com ${failures.length} parceiro(s) pendente(s). Consulte os erros abaixo.`
          : 'Sincronização de parceiros solicitada e concluída.';
      },
      error: failure => {
        if (guild === this.guildId) {
          this.error = failure?.error?.message || 'Falha ao sincronizar a vitrine.';
        }
      }
    });
  }

  private toDraft(item: PartnerDiscordItem): PartnerDiscordOptionRequest {
    return {
      exclusiveChannelEnabled: item.exclusiveChannelEnabled,
      existingTextChannelId: item.existingTextChannelId,
      adoptExistingTextChannel: item.adoptExistingTextChannel
    };
  }

  private apply(settings: PartnerDiscordSettings): void {
    this.state = settings;
    this.categoryId = settings.categoryId ?? '';
    this.parentId = settings.threadParentChannelId ?? '';
    this.drafts = Object.fromEntries(settings.partners.map(item => [item.partnerId, this.toDraft(item)]));
    this.dirtyChange.emit(false);
  }

  private finishSaving(): void {
    this.saving = false;
    this.savingChange.emit(false);
  }
}
