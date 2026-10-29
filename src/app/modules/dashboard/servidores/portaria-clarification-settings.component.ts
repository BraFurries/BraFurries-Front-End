import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
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

  loading = false;
  saving = false;
  error = '';
  success = '';
  enabled = false;
  categoryId: string | null = null;
  private generation = 0;

  constructor(private readonly service: ManagedServersService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['guildId']) this.load();
  }

  load(): void {
    const id = this.guildId;
    const generation = ++this.generation;
    this.enabled = false;
    this.categoryId = null;
    this.success = '';
    this.error = '';
    if (!id) return;
    this.loading = true;
    this.service.getPortariaClarificationSettings(id).subscribe({
      next: value => {
        if (generation !== this.generation || id !== this.guildId) return;
        this.enabled = value.enabled;
        this.categoryId = value.categoryId;
        this.loading = false;
      },
      error: () => {
        if (generation !== this.generation || id !== this.guildId) return;
        this.error = 'Não foi possível carregar a configuração dos tickets.';
        this.loading = false;
      }
    });
  }

  save(): void {
    if (!this.guildId || this.loading || this.saving ||
        (this.enabled && (!this.categoryId || !this.canManageChannels))) return;
    const id = this.guildId;
    const generation = this.generation;
    const request: PortariaClarificationSettings = {
      enabled: this.enabled,
      categoryId: this.categoryId
    };
    this.saving = true;
    this.error = '';
    this.success = '';
    this.service.updatePortariaClarificationSettings(id, request).subscribe({
      next: value => {
        if (generation !== this.generation || id !== this.guildId) return;
        this.enabled = value.enabled;
        this.categoryId = value.categoryId;
        this.saving = false;
        this.success = 'Configuração salva. As fichas e os atendimentos continuam no Discord.';
      },
      error: () => {
        if (generation !== this.generation || id !== this.guildId) return;
        this.saving = false;
        this.error = 'Não foi possível salvar. Confira suas permissões e a categoria escolhida.';
      }
    });
  }
}
