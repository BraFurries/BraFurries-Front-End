import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { AdminService } from '../../../../../core/services/admin.service';
import { AdminCoddyPresenceResponse, AdminCoddyPresenceServer } from '../../../../../shared/models/api/admin/admin';

@Component({
  selector: 'app-admin-coddy-presence',
  standalone: false,
  templateUrl: './coddy-presence.component.html',
  styleUrls: []
})
export class AdminCoddyPresenceComponent implements OnInit, OnDestroy {
  presence: AdminCoddyPresenceResponse | null = null;
  loading = true;
  errorMessage = '';
  search = '';
  status: '' | 'active' | 'inactive' = '';
  communityIdInput: number | null = null;
  expandedGuildId: string | null = null;
  private readonly destroyed$ = new Subject<void>();
  private requestSequence = 0;

  constructor(private readonly admin: AdminService) {}

  ngOnInit(): void { this.load(1); }

  ngOnDestroy(): void {
    this.requestSequence++;
    this.destroyed$.next();
    this.destroyed$.complete();
  }

  load(page = this.presence?.pagination.page ?? 1): void {
    const communityId = this.communityIdInput;
    if (communityId != null && (!Number.isInteger(communityId) || communityId < 1)) {
      this.errorMessage = 'Informe um ID de comunidade válido ou deixe o campo vazio.';
      return;
    }
    const sequence = ++this.requestSequence;
    this.loading = true;
    this.errorMessage = '';
    this.expandedGuildId = null;
    this.admin.getCoddyPresence({
      page, pageSize: 20, search: this.search.trim(), status: this.status,
      communityId: communityId ?? undefined
    }).pipe(takeUntil(this.destroyed$)).subscribe({
      next: data => {
        if (sequence !== this.requestSequence) return;
        this.presence = data;
        this.loading = false;
      },
      error: () => {
        if (sequence !== this.requestSequence) return;
        this.errorMessage = 'Não foi possível consultar a presença do Coddy.';
        this.loading = false;
      }
    });
  }

  applyFilters(): void { this.load(1); }

  previousPage(): void {
    const page = this.presence?.pagination.page ?? 1;
    if (page > 1 && !this.loading) this.load(page - 1);
  }

  nextPage(): void {
    const pagination = this.presence?.pagination;
    if (pagination && pagination.page < pagination.totalPages && !this.loading) {
      this.load(pagination.page + 1);
    }
  }

  toggleDetails(guildId: string): void {
    this.expandedGuildId = this.expandedGuildId === guildId ? null : guildId;
  }

  statusLabel(server: AdminCoddyPresenceServer): string {
    return server.active ? 'Ativo' : 'Inativo';
  }

  syncLabel(value: string | null): string {
    switch (value) {
      case 'HEALTHY': return 'Sincronizado';
      case 'RECONCILIATION_REQUIRED': return 'Reconciliação necessária';
      default: return value ? value.replace(/_/g, ' ') : 'Desconhecido';
    }
  }

  formatUtc(value: string | null): string {
    if (!value) return 'Não registrado';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return 'Não registrado';
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(parsed);
  }

  formatStoredDate(value: string | null): string {
    if (!value) return 'Não registrado';
    // These legacy LocalDateTime values have no declared timezone.
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    return match
      ? match[3] + '/' + match[2] + '/' + match[1] + ' ' + match[4] + ':' + match[5]
      : 'Não registrado';
  }
}
