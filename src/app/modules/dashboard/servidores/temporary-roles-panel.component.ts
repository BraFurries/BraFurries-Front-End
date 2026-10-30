import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import {
  GuildRole, ManagedServersService, TemporaryRoleGrant,
  TemporaryRoleCreate, TemporaryRoleRenew
} from '../../../core/services/managed-servers.service';

/** UI for administrative intent. Only Coddy applies Discord permissions. */
@Component({
  selector: 'app-temporary-roles-panel',
  standalone: false,
  templateUrl: './temporary-roles-panel.component.html'
})
export class TemporaryRolesPanelComponent implements OnChanges {
  @Input() guildId = '';
  @Input() roles: GuildRole[] = [];
  @Input() canManageRoles = false;

  grants: TemporaryRoleGrant[] = [];
  loading = false;
  busy = false;
  error = '';
  notice = '';
  discordUserId = '';
  roleId = '';
  expiresLocal = '';
  reason = '';
  renewExpiresLocal = '';
  renewReason = '';
  pending?: { type: 'RENEW' | 'CANCEL'; grant: TemporaryRoleGrant };
  private generation = 0;
  private createRequestId = '';

  constructor(private readonly api: ManagedServersService) {}

  get manageableRoles(): GuildRole[] {
    return this.roles.filter(role => role.editableByBot && !role.managed);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['guildId']) {
      this.pending = undefined;
      this.createRequestId = '';
      this.grants = [];
      this.notice = '';
      this.refresh();
    }
  }

  refresh(): void {
    const id = this.guildId;
    const generation = ++this.generation;
    this.loading = false;
    this.error = '';
    if (!id) { this.grants = []; return; }
    this.loading = true;
    this.api.listTemporaryRoles(id).subscribe({
      next: grants => {
        if (generation !== this.generation || id !== this.guildId) return;
        this.grants = grants;
        this.loading = false;
      },
      error: err => {
        if (generation !== this.generation || id !== this.guildId) return;
        this.loading = false;
        this.error = err.status === 403
          ? 'Sua conta não possui autorização administrativa para gerenciar cargos temporários.'
          : err.status === 404
            ? 'A gestão de cargos temporários ainda não está habilitada neste ambiente.'
            : 'Não foi possível consultar as concessões. Tente atualizar.';
      }
    });
  }

  roleName(id: string): string {
    return this.roles.find(role => role.id === id)?.name ?? `Cargo ${id}`;
  }

  private validSnowflake(value: string): boolean {
    return /^[1-9][0-9]{0,18}$/.test(value);
  }

  private futureUtc(value: string): string | null {
    const parsed = new Date(value);
    if (!value || Number.isNaN(parsed.getTime()) ||
        parsed.getTime() <= Date.now() || parsed.getTime() > Date.now() + 366 * 86400000) return null;
    return parsed.toISOString();
  }

  get canCreate(): boolean {
    return !!this.guildId && this.canManageRoles && !this.busy && !this.loading &&
      this.validSnowflake(this.discordUserId.trim()) &&
      this.manageableRoles.some(role => role.id === this.roleId) &&
      !!this.futureUtc(this.expiresLocal) &&
      this.reason.trim().length >= 10 && this.reason.trim().length <= 200;
  }

  create(): void {
    if (!this.canCreate) return;
    const id = this.guildId;
    const generation = this.generation;
    const expiresAt = this.futureUtc(this.expiresLocal);
    if (!expiresAt) return;
    if (!this.createRequestId) this.createRequestId = crypto.randomUUID();
    const request: TemporaryRoleCreate = {
      requestId: this.createRequestId,
      discordUserId: this.discordUserId.trim(),
      roleId: this.roleId,
      expiresAt,
      reason: this.reason.trim()
    };
    this.busy = true;
    this.error = '';
    this.notice = '';
    this.api.createTemporaryRole(id, request).subscribe({
      next: () => {
        if (id !== this.guildId || generation !== this.generation) return;
        this.busy = false;
        this.createRequestId = '';
        this.discordUserId = '';
        this.roleId = '';
        this.expiresLocal = '';
        this.reason = '';
        this.notice = 'Concessão registrada. O Coddy aplicará o cargo e informará o estado.';
        this.refresh();
      },
      error: err => this.onFailure(id, generation, err)
    });
  }

  requestCancel(grant: TemporaryRoleGrant): void {
    if (this.busy || grant.status !== 'ACTIVE') return;
    this.pending = { type: 'CANCEL', grant };
  }

  requestRenew(grant: TemporaryRoleGrant): void {
    if (this.busy || grant.status !== 'ACTIVE') return;
    this.pending = { type: 'RENEW', grant };
    this.renewReason = grant.reason;
    this.renewExpiresLocal = '';
  }

  get canConfirm(): boolean {
    if (!this.pending || this.busy || this.loading) return false;
    if (this.pending.type === 'CANCEL') return true;
    const next = this.futureUtc(this.renewExpiresLocal);
    return !!next && new Date(next).getTime() > new Date(this.pending.grant.expiresAt).getTime() &&
      this.renewReason.trim().length >= 10 && this.renewReason.trim().length <= 200;
  }

  confirm(): void {
    if (!this.canConfirm || !this.pending) return;
    const action = this.pending;
    const id = this.guildId;
    const generation = this.generation;
    this.busy = true;
    this.error = '';
    this.notice = '';
    const request: TemporaryRoleRenew = {
      expectedVersion: action.grant.version,
      expiresAt: this.futureUtc(this.renewExpiresLocal) ?? '',
      reason: this.renewReason.trim()
    };
    const result = action.type === 'RENEW'
      ? this.api.renewTemporaryRole(id, action.grant.id, request)
      : this.api.cancelTemporaryRole(id, action.grant.id, action.grant.version);
    result.subscribe({
      next: () => {
        if (id !== this.guildId || generation !== this.generation) return;
        this.busy = false;
        this.pending = undefined;
        this.notice = action.type === 'RENEW'
          ? 'Prazo renovado. A atualização será reconciliada pelo Coddy.'
          : 'Cancelamento registrado. O Coddy verificará se pode retirar o cargo.';
        this.refresh();
      },
      error: err => this.onFailure(id, generation, err)
    });
  }

  private onFailure(id: string, generation: number, err: {status?: number}): void {
    if (id !== this.guildId || generation !== this.generation) return;
    this.busy = false;
    this.error = err.status === 409
      ? 'Concessão alterada ou já existente. Atualize a lista antes de tentar novamente.'
      : err.status === 403
        ? 'Você não possui permissão para esta operação.'
        : err.status === 400 || err.status === 422
          ? 'Confira cargo, usuário, data, justificativa e permissões do bot.'
          : 'Falha ao salvar a operação. Tente novamente.';
  }
}
