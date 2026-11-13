import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  GuildCategory, ManagedServersService, PortariaClarificationSettings
} from '../../../core/services/managed-servers.service';

/**
 * Configuration UI only. Form reviews and individual tickets remain in Discord.
 */
@Component({
  selector: 'app-portaria-clarification-settings',
  standalone: false,
  templateUrl: './portaria-clarification-settings.component.html'
})
export class PortariaClarificationSettingsComponent implements OnChanges {
  @Input() guildId = '';
  @Input() categories: GuildCategory[] = [];
  @Input() canManageChannels = false;
  @Output() dirtyChange = new EventEmitter<boolean>();

  loading = false;
  saving = false;
  error = '';
  success = '';
  enabled = false;
  categoryId: string | null = null;
  private generation = 0;
  private persisted?: PortariaClarificationSettings;

  get dirty(): boolean {
    return !!this.persisted && (
      this.enabled !== this.persisted.enabled || this.categoryId !== this.persisted.categoryId
    );
  }

  get canSave(): boolean {
    return !this.loading && !this.saving && !!this.guildId && !!this.persisted
      && (!this.enabled || (!!this.categoryId && this.canManageChannels));
  }

  onDraftChange(): void {
    this.error = '';
    this.success = '';
    this.dirtyChange.emit(this.dirty);
  }

  discard(): void {
    if (!this.persisted || this.saving) return;
    this.enabled = this.persisted.enabled;
    this.categoryId = this.persisted.categoryId;
    this.error = '';
    this.success = '';
    this.dirtyChange.emit(false);
  }

  constructor(private readonly service: ManagedServersService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['guildId']) this.load();
  }

  load(): void {
    const id = this.guildId;
    const generation = ++this.generation;
    this.enabled = false;
    this.categoryId = null;
    this.saving = false;
    this.loading = false;
    this.success = '';
    this.error = '';
    this.persisted = undefined;
    this.dirtyChange.emit(false);
    if (!id) return;
    this.loading = true;
    this.service.getPortariaClarificationSettings(id).subscribe({
      next: value => {
        if (generation !== this.generation || id !== this.guildId) return;
        this.enabled = value.enabled;
        this.categoryId = value.categoryId;
        this.persisted = { ...value };
        this.loading = false;
        this.dirtyChange.emit(false);
      },
      error: () => {
        if (generation !== this.generation || id !== this.guildId) return;
        this.error = 'Não foi possível carregar a configuração dos tickets.';
        this.loading = false;
      }
    });
  }

  // Kept for callers that previously invoked save() directly; the UI now
  // delegates this step to the Portaria-wide floating save bar.
  save(): void { void this.savePending().catch(() => undefined); }

  async savePending(): Promise<void> {
    if (!this.dirty) return;
    if (!this.canSave) throw new Error('Selecione uma categoria válida e confira as permissões de Gerenciar Canais.');
    const id = this.guildId;
    const generation = this.generation;
    const request: PortariaClarificationSettings = {
      enabled: this.enabled,
      categoryId: this.categoryId
    };
    this.saving = true;
    this.error = '';
    this.success = '';
    try {
      const value = await firstValueFrom(this.service.updatePortariaClarificationSettings(id, request));
      if (generation !== this.generation || id !== this.guildId) return;
      this.enabled = value.enabled;
      this.categoryId = value.categoryId;
      this.persisted = { ...value };
      this.dirtyChange.emit(false);
      this.success = 'Configuração de tickets salva.';
    } catch (failure: any) {
      if (generation === this.generation && id === this.guildId) {
        this.error = failure?.error?.message
          || 'Não foi possível salvar. Confira suas permissões e a categoria escolhida.';
      }
      throw failure;
    } finally {
      if (generation === this.generation && id === this.guildId) this.saving = false;
    }
  }
}
