import { Component, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges } from '@angular/core';

import {
  GuildResources,
  GuildRole,
  ManagedServersService,
  VipConfigResponse,
  VipConfigUpdateRequest
} from '../../../core/services/managed-servers.service';

@Component({
  selector: 'app-vip-configuration-panel',
  standalone: false,
  templateUrl: './vip-configuration-panel.component.html',
  styleUrl: './vip-configuration-panel.component.scss'
})
export class VipConfigurationPanelComponent implements OnChanges, OnDestroy {
  @Input() guildId = '';
  @Input() resources?: GuildResources;
  @Output() dirtyChange = new EventEmitter<boolean>();
  @Output() savingChange = new EventEmitter<boolean>();

  persisted?: VipConfigResponse;
  draft?: VipConfigResponse;
  loading = false;
  saving = false;
  error = '';
  saveMessage = '';

  private generation = 0;
  private draftRevision = 0;

  constructor(private readonly service: ManagedServersService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['guildId'] && this.guildId) this.load();
  }

  ngOnDestroy(): void {
    this.dirtyChange.emit(false);
    this.savingChange.emit(false);
  }

  get dirty(): boolean {
    return !!this.persisted && !!this.draft
      && JSON.stringify(this.editable(this.persisted)) !== JSON.stringify(this.editable(this.draft));
  }

  get canSave(): boolean {
    return !!this.draft
      && this.dirty
      && !this.saving
      && !!this.draft.customRolePrefix.trim()
      && this.draft.customRolePrefix.trim().length <= 67
      && (!this.rangeEnabled || !!this.draft.customRoleRange.topRoleId);
  }

  get roles(): GuildRole[] {
    return [...(this.resources?.roles ?? [])].sort((a, b) => b.position - a.position);
  }

  get missingConfiguredRoleIds(): string[] {
    if (!this.draft) return [];
    const available = new Set(this.roles.map(role => role.id));
    return this.draft.roleIds.filter(roleId => !available.has(roleId));
  }

  get rangeEnabled(): boolean {
    return !!this.draft?.customRoleRange.topRoleId;
  }

  get topRoleOptions(): GuildRole[] {
    const botPosition = this.resources?.botCapabilities.botTopRole?.position;
    if (botPosition == null) return [];
    return this.roles.filter(role => role.position > 1 && role.position < botPosition);
  }

  get bottomRoleOptions(): GuildRole[] {
    const top = this.role(this.draft?.customRoleRange.topRoleId);
    if (!top) return [];
    return this.roles.filter(role => role.position < top.position - 1);
  }

  get rangeUnavailableReason(): string | null {
    if (!this.resources?.botCapabilities.canManageRoles) {
      return 'O Coddy não possui Manage Roles neste servidor.';
    }
    if (!this.resources.botCapabilities.botTopRole) {
      return 'A posição do cargo do Coddy não está disponível.';
    }
    if (!this.topRoleOptions.length) {
      return 'Não há uma âncora gerenciável abaixo do cargo do Coddy.';
    }
    return null;
  }

  role(roleId: string | null | undefined): GuildRole | undefined {
    return roleId ? this.roles.find(role => role.id === roleId) : undefined;
  }

  addRole(roleId: string): void {
    if (!this.draft || !roleId || this.draft.roleIds.includes(roleId)) return;
    if (!this.roles.some(role => role.id === roleId)) return;
    this.draft.roleIds = [...this.draft.roleIds, roleId];
    this.onDraftChanged();
  }

  removeRole(roleId: string): void {
    if (!this.draft) return;
    this.draft.roleIds = this.draft.roleIds.filter(id => id !== roleId);
    this.onDraftChanged();
  }

  toggleRange(enabled: boolean): void {
    if (!this.draft) return;
    if (!enabled) {
      this.draft.customRoleRange = { topRoleId: null, bottomRoleId: null };
    } else {
      this.draft.customRoleRange = {
        topRoleId: this.topRoleOptions[0]?.id ?? null,
        bottomRoleId: null
      };
    }
    this.onDraftChanged();
  }

  updateTopRole(roleId: string | null): void {
    if (!this.draft) return;
    this.draft.customRoleRange.topRoleId = roleId || null;
    const bottom = this.role(this.draft.customRoleRange.bottomRoleId);
    const top = this.role(this.draft.customRoleRange.topRoleId);
    if (bottom && top && bottom.position >= top.position - 1) {
      this.draft.customRoleRange.bottomRoleId = null;
    }
    this.onDraftChanged();
  }

  onDraftChanged(): void {
    this.draftRevision++;
    this.error = '';
    this.saveMessage = '';
    this.dirtyChange.emit(this.dirty);
  }

  resetDraft(): void {
    if (!this.persisted || this.saving) return;
    this.draft = structuredClone(this.persisted);
    this.draftRevision++;
    this.error = '';
    this.saveMessage = '';
    this.dirtyChange.emit(false);
  }

  save(): void {
    if (!this.draft || !this.canSave) return;
    const guildId = this.guildId;
    const submittedRevision = this.draftRevision;
    const request = this.editable(this.draft);

    this.saving = true;
    this.savingChange.emit(true);
    this.error = '';
    this.saveMessage = '';

    this.service.updateVip(guildId, request).subscribe({
      next: response => {
        if (guildId !== this.guildId) return this.finishSave();
        this.persisted = structuredClone(response);
        if (submittedRevision === this.draftRevision) {
          this.draft = structuredClone(response);
          this.saveMessage = response.runtimeSyncPending
            ? 'Configuração salva. A reconciliação imediata do Coddy ficou pendente.'
            : 'Configuração VIP salva e reconciliação solicitada.';
        } else {
          this.saveMessage = 'Configuração salva; alterações feitas durante o salvamento continuam não salvas.';
        }
        this.finishSave();
        this.dirtyChange.emit(this.dirty);
      },
      error: error => {
        if (guildId === this.guildId) {
          this.error = error?.error?.message || error?.error?.detail || 'Não foi possível salvar a configuração VIP.';
        }
        this.finishSave();
      }
    });
  }

  load(): void {
    const guildId = this.guildId;
    const generation = ++this.generation;
    this.loading = true;
    this.saving = false;
    this.savingChange.emit(false);
    this.error = '';
    this.saveMessage = '';
    this.persisted = undefined;
    this.draft = undefined;
    this.dirtyChange.emit(false);

    this.service.getVip(guildId).subscribe({
      next: response => {
        if (guildId !== this.guildId || generation !== this.generation) return;
        this.persisted = structuredClone(response);
        this.draft = structuredClone(response);
        this.draftRevision = 0;
        this.loading = false;
      },
      error: error => {
        if (guildId !== this.guildId || generation !== this.generation) return;
        this.error = error?.error?.message || error?.error?.detail || 'Não foi possível carregar a configuração VIP.';
        this.loading = false;
      }
    });
  }

  private editable(config: VipConfigResponse): VipConfigUpdateRequest {
    return {
      roleIds: [...config.roleIds].sort(),
      customRolePrefix: config.customRolePrefix.trim(),
      customRoleRange: {
        topRoleId: config.customRoleRange.topRoleId || null,
        bottomRoleId: config.customRoleRange.bottomRoleId || null
      },
      allowStaffColors: config.allowStaffColors
    };
  }

  private finishSave(): void {
    this.saving = false;
    this.savingChange.emit(false);
  }
}
