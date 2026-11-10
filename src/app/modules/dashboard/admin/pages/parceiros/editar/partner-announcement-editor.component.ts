import { Component, Input, OnChanges, OnDestroy, SimpleChanges } from '@angular/core';
import { finalize } from 'rxjs';
import {
  PartnerDiscordAnnouncementRequest,
  PartnerDiscordItem,
  PartnerDiscordService
} from '../../../../../../core/services/partner-discord.service';

@Component({
  selector: 'app-partner-announcement-editor',
  standalone: false,
  templateUrl: './partner-announcement-editor.component.html'
})
export class PartnerAnnouncementEditorComponent implements OnChanges, OnDestroy {
  @Input() partnerId = 0;
  @Input() partnerName = '';

  loading = false;
  configured = false;
  guildId = '';
  partner: PartnerDiscordItem | null = null;
  draft: PartnerDiscordAnnouncementRequest = { markdown: '', linksMode: 'INLINE_ONLY', publicContact: '' };
  saving = false;
  syncing = false;
  error = '';
  success = '';
  private generation = 0;

  constructor(private readonly service: PartnerDiscordService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['partnerId']) this.load();
  }

  ngOnDestroy(): void {
    this.generation++;
  }

  get dirty(): boolean {
    if (!this.partner) return false;
    return (this.draft.markdown || null) !== (this.partner.announcementMarkdown || null)
      || this.draft.linksMode !== this.partner.announcementLinksMode
      || (this.draft.publicContact || null) !== (this.partner.announcementPublicContact || null);
  }

  get busy(): boolean {
    return this.saving || this.syncing;
  }

  load(): void {
    const generation = ++this.generation;
    const id = this.partnerId;
    if (!Number.isInteger(id) || id <= 0) return;
    this.loading = true;
    this.partner = null;
    this.configured = false;
    this.error = '';
    this.success = '';
    this.service.getSettings().subscribe({
      next: state => {
        if (generation !== this.generation || id !== this.partnerId) return;
        this.guildId = state.guildId;
        this.configured = state.configured;
        this.partner = state.partners.find(item => item.partnerId === id) ?? null;
        if (!this.partner) {
          this.error = 'O anúncio desta parceria não está disponível na Community oficial.';
        } else {
          this.draft = this.toDraft(this.partner);
        }
        this.loading = false;
      },
      error: failure => {
        if (generation !== this.generation || id !== this.partnerId) return;
        this.error = failure?.status === 403
          ? 'Você não tem permissão para gerenciar anúncios de parceiros.'
          : failure?.error?.message || 'Não foi possível carregar o anúncio do Discord.';
        this.loading = false;
      }
    });
  }

  updateDraft(changes: Partial<PartnerDiscordAnnouncementRequest>): void {
    if (this.busy || !this.partner) return;
    this.draft = { ...this.draft, ...changes };
    this.error = '';
    this.success = '';
  }

  discardChanges(): void {
    if (!this.partner || this.busy) return;
    this.draft = this.toDraft(this.partner);
    this.error = '';
  }

  save(): void {
    if (!this.partner || !this.configured || !this.dirty || this.busy) return;
    if ((this.draft.markdown || '').length > 16000 || (this.draft.publicContact || '').length > 255) {
      this.error = 'Anúncio limitado a 16.000 caracteres e contato a 255.';
      return;
    }
    const id = this.partnerId;
    const generation = this.generation;
    this.saving = true;
    this.error = '';
    this.success = '';
    this.service.updateAnnouncement(id, {
      markdown: this.draft.markdown?.trim() || null,
      linksMode: this.draft.linksMode,
      publicContact: this.draft.publicContact?.trim() || null
    }).pipe(finalize(() => this.saving = false)).subscribe({
      next: updated => {
        if (generation !== this.generation || id !== this.partnerId) return;
        this.partner = updated;
        this.draft = this.toDraft(updated);
        this.success = 'Anúncio salvo. Use Publicar/atualizar no Discord para aplicá-lo à thread.';
      },
      error: failure => {
        if (generation !== this.generation || id !== this.partnerId) return;
        this.error = failure?.error?.message || 'Não foi possível salvar o anúncio Markdown.';
      }
    });
  }

  sync(): void {
    // Never send an out-of-date persisted draft or publish while editing.
    if (!this.partner || !this.configured || this.dirty || this.busy) return;
    const id = this.partnerId;
    const generation = this.generation;
    this.syncing = true;
    this.error = '';
    this.success = '';
    this.service.syncPartner(id).pipe(finalize(() => this.syncing = false)).subscribe({
      next: updated => {
        if (generation !== this.generation || id !== this.partnerId) return;
        this.partner = updated;
        this.draft = this.toDraft(updated);
        this.success = updated.appliedRevision >= updated.desiredRevision && !updated.contentOutOfSync
          ? 'Anúncio publicado e sincronizado com o Discord.'
          : 'Publicação solicitada; ainda há uma atualização pendente.';
      },
      error: failure => {
        if (generation !== this.generation || id !== this.partnerId) return;
        this.error = failure?.error?.message || 'Falha ao sincronizar. Consulte o estado antes de repetir.';
      }
    });
  }

  /** Preview is approximate. Escape all user HTML before adding fixed formatting. */
  previewMarkdown(value: string): string {
    const escaped = (value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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
        return '<h3 class="' + cls + ' font-bold mt-3 mb-1">' + inline(heading[2]) + '</h3>';
      }
      if (/^\s*[-*]\s+/.test(line)) {
        return '<div class="pl-3 my-1">• ' + inline(line.replace(/^\s*[-*]\s+/, '')) + '</div>';
      }
      return line.trim() ? '<p class="my-1">' + inline(line) + '</p>' : '<div class="h-2"></div>';
    }).join('');
  }

  private toDraft(item: PartnerDiscordItem): PartnerDiscordAnnouncementRequest {
    return {
      markdown: item.announcementMarkdown ?? '',
      linksMode: item.announcementLinksMode ?? 'INLINE_ONLY',
      publicContact: item.announcementPublicContact ?? ''
    };
  }
}
