import { Component, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges } from '@angular/core';
import { finalize, switchMap } from 'rxjs';
import { GuildCategory, GuildChannel, GuildResources } from '../../../core/services/managed-servers.service';
import {
  PartnerDiscordItem,
  PartnerDiscordAnnouncementRequest,
  PartnerDiscordOptionRequest,
  PartnerDiscordService,
  PartnerDiscordSettings
} from '../../../core/services/partner-discord.service';

@Component({
  selector: 'app-partner-discord-panel',
  standalone: false,
  templateUrl: './partner-discord-panel.component.html'
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
  announcementDrafts: Record<number, PartnerDiscordAnnouncementRequest> = {};
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
      this.partnerDirty(item) || this.announcementDirty(item)
    );
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

  announcementDirty(item: PartnerDiscordItem): boolean {
    const draft = this.announcementDrafts[item.partnerId];
    return !!draft && (
      (draft.markdown || null) !== (item.announcementMarkdown || null)
      || draft.linksMode !== item.announcementLinksMode
      || (draft.publicContact || null) !== (item.announcementPublicContact || null)
    );
  }

  updateAnnouncementDraft(item: PartnerDiscordItem, changes: Partial<PartnerDiscordAnnouncementRequest>): void {
    const current = this.announcementDrafts[item.partnerId] ?? this.toAnnouncementDraft(item);
    this.announcementDrafts[item.partnerId] = { ...current, ...changes };
    this.error = '';
    this.success = '';
    this.dirtyChange.emit(this.dirty);
  }

  /** Approximate Discord Markdown preview. Always HTML-escape user content
   * before adding static markup; Angular sanitizes innerHTML again. */
  previewMarkdown(text: string): string {
    const escaped = (text || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
    const inline = (line: string): string => line
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/__(.+?)__/g, '<u>$1</u>')
      .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer" class="underline">$1</a>');
    return escaped.split('\n').map(line => {
      const heading = /^(#{1,3})\s+(.+)$/.exec(line);
      if (heading) {
        const cls = heading[1].length === 1 ? 'text-lg' : 'text-base';
        return `<h3 class="${cls} font-bold mt-3 mb-1">${inline(heading[2])}</h3>`;
      }
      if (/^\s*[-*]\s+/.test(line)) {
        return `<div class="pl-3 my-1">• ${inline(line.replace(/^\s*[-*]\s+/, ''))}</div>`;
      }
      return line.trim()
        ? `<p class="my-1">${inline(line)}</p>`
        : '<div class="h-2"></div>';
    }).join('');
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
    this.announcementDrafts = {};
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

  saveConfig(): void {
    if (!this.enabled || this.saving || !this.hasConfigChanges) return;
    const guild = this.guildId;
    this.saving = true;
    this.savingChange.emit(true);
    this.error = '';
    this.success = '';
    this.service.updateConfig({
      categoryId: this.categoryId || null,
      threadParentChannelId: this.parentId || null
    }).pipe(finalize(() => this.finishSaving())).subscribe({
      next: state => {
        if (guild !== this.guildId) return;
        this.apply(state);
        this.success = 'Destino da vitrine configurado. Use Sincronizar para publicar.';
      },
      error: failure => {
        if (guild === this.guildId) {
          this.error = failure?.error?.message || 'Não foi possível salvar o destino da vitrine.';
        }
      }
    });
  }

  savePartner(item: PartnerDiscordItem): void {
    const draft = this.drafts[item.partnerId];
    if (!this.enabled || !this.state?.configured || !draft || this.saving || this.busyPartnerId != null) return;
    if (draft.exclusiveChannelEnabled && !item.representativeDiscordUserId) {
      this.error = 'Defina um representante com Discord vinculado ao cadastro antes de habilitar o canal.';
      return;
    }
    if (draft.existingTextChannelId && !draft.adoptExistingTextChannel) {
      this.error = 'Confirme a adoção do canal existente para prosseguir.';
      return;
    }
    const guild = this.guildId;
    this.busyPartnerId = item.partnerId;
    this.savingChange.emit(true);
    this.error = '';
    this.success = '';
    this.service.updatePartner(item.partnerId, draft).pipe(
      switchMap(() => this.service.syncPartner(item.partnerId)),
      finalize(() => { this.busyPartnerId = null; this.savingChange.emit(false); })
    ).subscribe({
      next: updated => {
        if (guild !== this.guildId || !this.state) return;
        this.state = {
          ...this.state,
          partners: this.state.partners.map(current => current.partnerId === updated.partnerId ? updated : current)
        };
        this.drafts[updated.partnerId] = this.toDraft(updated);
        this.success = updated.appliedRevision >= updated.desiredRevision
          ? 'Parceiro salvo e sincronizado com o Discord.'
          : 'Preferência salva; sincronização ainda pendente.';
        this.dirtyChange.emit(this.dirty);
      },
      error: failure => {
        if (guild === this.guildId) {
          this.error = failure?.error?.message
            || 'Configuração possivelmente salva, mas não foi possível sincronizar. Recarregue o estado.';
        }
      }
    });
  }

  saveAnnouncement(item: PartnerDiscordItem): void {
    const draft = this.announcementDrafts[item.partnerId];
    if (!this.enabled || !this.state?.configured || !draft
      || !this.announcementDirty(item) || this.saving || this.busyPartnerId !== null) return;
    if ((draft.markdown || '').length > 16000 || (draft.publicContact || '').length > 255) {
      this.error = 'Anúncio limitado a 16.000 caracteres e contato a 255.';
      return;
    }
    const guild = this.guildId;
    this.busyPartnerId = item.partnerId;
    this.savingChange.emit(true);
    this.error = '';
    this.success = '';
    this.service.updateAnnouncement(item.partnerId, draft)
      .pipe(finalize(() => {
        this.busyPartnerId = null;
        this.savingChange.emit(false);
      }))
      .subscribe({
        next: updated => {
          if (guild !== this.guildId || !this.state) return;
          this.state = {
            ...this.state,
            partners: this.state.partners.map(current =>
              current.partnerId === updated.partnerId ? updated : current
            )
          };
          this.announcementDrafts[updated.partnerId] = this.toAnnouncementDraft(updated);
          this.success = 'Anúncio salvo. Use Publicar/atualizar no Discord para aplicá-lo à thread.';
          this.dirtyChange.emit(this.dirty);
        },
        error: failure => {
          if (guild === this.guildId) {
            this.error = failure?.error?.message || 'Não foi possível salvar o anúncio Markdown.';
          }
        }
      });
  }

  syncOne(item: PartnerDiscordItem): void {
    if (!this.enabled || !this.state?.configured || this.saving
      || this.busyPartnerId !== null || this.dirty) return;
    const guild = this.guildId;
    this.busyPartnerId = item.partnerId;
    this.savingChange.emit(true);
    this.error = '';
    this.success = '';
    this.service.syncPartner(item.partnerId).pipe(
      finalize(() => {
        this.busyPartnerId = null;
        this.savingChange.emit(false);
      })
    ).subscribe({
      next: updated => {
        if (guild !== this.guildId || !this.state) return;
        this.state = {
          ...this.state,
          partners: this.state.partners.map(current =>
            current.partnerId === updated.partnerId ? updated : current
          )
        };
        this.announcementDrafts[updated.partnerId] = this.toAnnouncementDraft(updated);
        this.success = 'Anúncio atualizado na thread do Discord.';
        this.dirtyChange.emit(this.dirty);
      },
      error: failure => {
        if (guild === this.guildId) {
          this.error = failure?.error?.message || 'Falha ao sincronizar. Verifique o estado antes de repetir.';
        }
      }
    });
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

  private toAnnouncementDraft(item: PartnerDiscordItem): PartnerDiscordAnnouncementRequest {
    return {
      markdown: item.announcementMarkdown ?? '',
      linksMode: item.announcementLinksMode ?? 'INLINE_ONLY',
      publicContact: item.announcementPublicContact ?? ''
    };
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
    this.announcementDrafts = Object.fromEntries(settings.partners.map(item =>
      [item.partnerId, this.toAnnouncementDraft(item)]
    ));
    this.dirtyChange.emit(false);
  }

  private finishSaving(): void {
    this.saving = false;
    this.savingChange.emit(false);
  }
}
