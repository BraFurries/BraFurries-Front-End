import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { distinctUntilChanged, Observable, Subject, takeUntil } from 'rxjs';
import { PlatformAccessService } from '../../../core/services/platform-access.service';
import {
  CreatorPilotCandidate, CreatorPilotFilter, CreatorPilotInvitation,
  CreatorHoldCategory, CreatorRetentionHold, CreatorRetentionDryRun, CreatorStudioPilotAdminService
} from '../../../core/services/creator-studio-pilot-admin.service';
import { UserService } from '../../../core/services/user.service';

/**
 * Internal pilot administration, available only to the configured platform owner.
 * The API independently authorizes every read and every change.
 */
@Component({
  selector: 'app-admin-creator-pilot',
  standalone: false,
  templateUrl: './admin-creator-pilot.component.html'
})
export class AdminCreatorPilotComponent implements OnInit, OnDestroy {
  readonly pageSize = 25;

  checkingOwner = true;
  owner = false;
  loading = false;
  searching = false;
  saving = false;
  errorMessage = '';
  successMessage = '';
  candidateInput = '';
  candidate: CreatorPilotCandidate | null = null;
  participants: CreatorPilotInvitation[] = [];
  filter: CreatorPilotFilter = 'ALL';
  page = 1;
  total = 0;

  holdArtistId = '';
  holdCommissionId = '';
  holdCategory: CreatorHoldCategory = 'DISPUTE';
  holdReason = '';
  hold: CreatorRetentionHold | null = null;
  holdBusy = false;
  holdError = '';
  holdSuccess = '';
  private holdSequence = 0;

  retentionReport: CreatorRetentionDryRun | null = null;
  retentionReportBusy = false;
  retentionReportError = '';
  private retentionReportSequence = 0;

  private accountId: number | null = null;
  private accountSequence = 0;
  private listSequence = 0;
  private candidateSequence = 0;
  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly users: UserService,
    private readonly platform: PlatformAccessService,
    private readonly studio: CreatorStudioPilotAdminService
  ) {}

  ngOnInit(): void {
    this.users.user$
      .pipe(
        distinctUntilChanged((a, b) => a?.id === b?.id),
        takeUntil(this.destroy$)
      )
      .subscribe(user => {
        const seq = ++this.accountSequence;
        this.accountId = user?.id ?? null;
        this.listSequence++;
        this.candidateSequence++;
        this.holdSequence++;
        this.retentionReportSequence++;
        this.retentionReport = null;
        this.retentionReportBusy = false;
        this.retentionReportError = '';
        this.hold = null;
        this.holdArtistId = '';
        this.holdCommissionId = '';
        this.holdReason = '';
        this.holdBusy = false;
        this.holdError = '';
        this.holdSuccess = '';
        this.checkingOwner = user != null;
        this.owner = false;
        this.loading = false;
        this.searching = false;
        this.saving = false;
        this.candidate = null;
        this.participants = [];
        this.total = 0;
        this.page = 1;
        this.errorMessage = '';
        this.successMessage = '';
        if (!user) {
          this.errorMessage = 'Entre na sua conta para gerenciar o piloto.';
          return;
        }
        this.platform.myAccess().pipe(takeUntil(this.destroy$)).subscribe({
          next: access => {
            if (!this.isCurrent(seq, user.id)) return;
            this.checkingOwner = false;
            this.owner = access.enabled && access.owner;
            if (this.owner) this.loadParticipants();
          },
          error: () => {
            if (!this.isCurrent(seq, user.id)) return;
            this.checkingOwner = false;
            this.errorMessage = 'Não foi possível verificar sua autorização.';
          }
        });
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get pageCount(): number {
    return Math.max(1, Math.ceil(this.total / this.pageSize));
  }

  get canGrantPilot(): boolean {
    const c = this.candidate;
    return !!c && !c.mergedAccount &&
      c.currentAccess.sourceKind !== 'BILLING' &&
      !(c.currentAccess.allowed && c.currentAccess.tier === 'PRO'
        && c.currentAccess.sourceKind === 'PILOT');
  }

  canRevoke(item: CreatorPilotInvitation): boolean {
    return item.status === 'ACTIVE' &&
      (item.sourceKind === 'PILOT' || item.sourceKind === 'INVITE');
  }

  changeFilter(): void {
    this.page = 1;
    this.loadParticipants();
  }

  previousPage(): void {
    if (!this.loading && this.page > 1) {
      this.page--;
      this.loadParticipants();
    }
  }

  nextPage(): void {
    if (!this.loading && this.page < this.pageCount) {
      this.page++;
      this.loadParticipants();
    }
  }

  loadParticipants(): void {
    if (!this.owner) return;
    const seq = ++this.listSequence;
    const ownerUserId = this.accountId;
    this.loading = true;
    this.errorMessage = '';
    this.studio.list(this.filter, this.page, this.pageSize)
      .pipe(takeUntil(this.destroy$)).subscribe({
        next: result => {
          if (!this.isCurrentAccount(ownerUserId) || seq !== this.listSequence) return;
          this.loading = false;
          this.participants = result.items;
          this.total = result.total;
        },
        error: error => {
          if (!this.isCurrentAccount(ownerUserId) || seq !== this.listSequence) return;
          this.loading = false;
          this.handleError(error, 'Não foi possível carregar os participantes.');
        }
      });
  }

  onCandidateInputChanged(): void {
    this.candidateSequence++;
    this.candidate = null;
  }

  lookupCandidate(): void {
    if (!this.owner || this.searching || this.saving) return;
    const rawId = String(this.candidateInput).trim();
    const userId = /^[1-9]\d*$/.test(rawId) ? Number(rawId) : NaN;
    if (!Number.isSafeInteger(userId) || userId <= 0) {
      this.candidate = null;
      this.errorMessage = 'Informe um ID de usuário válido.';
      return;
    }
    const seq = ++this.candidateSequence;
    const ownerUserId = this.accountId;
    this.candidate = null;
    this.searching = true;
    this.errorMessage = '';
    this.successMessage = '';
    this.studio.candidate(userId).pipe(takeUntil(this.destroy$)).subscribe({
      next: result => {
        if (!this.isCurrentAccount(ownerUserId) || seq !== this.candidateSequence) return;
        this.searching = false;
        this.candidate = result;
      },
      error: error => {
        if (!this.isCurrentAccount(ownerUserId) || seq !== this.candidateSequence) return;
        this.searching = false;
        this.handleError(error, 'Não foi possível localizar esta conta.');
      }
    });
  }

  grantPilot(): void {
    const c = this.candidate;
    if (!this.owner || !this.canGrantPilot || !c || this.saving) return;
    const confirmed = window.confirm(
      `Conceder Pro vitalício para ${c.displayName || 'usuário'} (#${c.userId})? ` +
      'A concessão não terá vencimento e ficará registrada na auditoria.'
    );
    if (!confirmed) return;
    this.change(this.studio.grantLifetimePro(c.userId),
      'Pro vitalício concedido ao participante do piloto.', c.userId);
  }

  revokePilot(item: CreatorPilotInvitation): void {
    if (!this.owner || this.saving || !this.canRevoke(item)) return;
    const confirmed = window.confirm(
      `Revogar o acesso de ${item.displayName || 'usuário'} (#${item.userId})? ` +
      'O Studio ficará bloqueado imediatamente, mas os dados das commissions serão preservados.'
    );
    if (!confirmed) return;
    this.change(this.studio.revoke(item.userId),
      'Acesso revogado. Dados das commissions preservados.', item.userId);
  }

  /**
   * Never run on behalf of a different logged-in account; stale responses
   * are discarded after user switches or a newer report is requested.
   */
  loadRetentionReport(): void {
    if (!this.owner || this.retentionReportBusy) return;
    const seq = ++this.retentionReportSequence;
    const account = this.accountId;
    this.retentionReportBusy = true;
    this.retentionReportError = '';
    this.retentionReport = null;
    this.studio.retentionDryRun().pipe(takeUntil(this.destroy$)).subscribe({
      next: result => {
        if (!this.isCurrentAccount(account) || seq !== this.retentionReportSequence) return;
        this.retentionReportBusy = false;
        this.retentionReport = result;
      },
      error: err => {
        if (!this.isCurrentAccount(account) || seq !== this.retentionReportSequence) return;
        this.retentionReportBusy = false;
        this.retentionReport = null;
        if (err instanceof HttpErrorResponse && err.status === 403) {
          this.handleError(err, 'Acesso negado ao relatório de retenção.');
        } else {
          this.retentionReportError = 'Não foi possível consultar a previsão de retenção.';
        }
      }
    });
  }

  private invalidateRetentionReport(): void {
    this.retentionReportSequence++;
    this.retentionReport = null;
    this.retentionReportBusy = false;
    this.retentionReportError = '';
  }

  onHoldFieldsChanged(): void {
    this.holdSequence++;
    this.hold = null;
    this.holdError = '';
    this.holdSuccess = '';
  }

  private holdIds(): {artistUserId: number; commissionId: number} | null {
    const rawArtist = String(this.holdArtistId).trim();
    const rawCommission = String(this.holdCommissionId).trim();
    if (!/^[1-9]\d*$/.test(rawArtist) || !/^[1-9]\d*$/.test(rawCommission)) return null;
    const artistUserId = Number(rawArtist);
    const commissionId = Number(rawCommission);
    if (!Number.isSafeInteger(artistUserId) || !Number.isSafeInteger(commissionId)) return null;
    return {artistUserId, commissionId};
  }

  inspectHold(): void {
    if (!this.owner || this.holdBusy) return;
    const ids = this.holdIds();
    if (!ids) {
      this.holdError = 'Informe IDs válidos do artista e da commission.';
      return;
    }
    const seq = ++this.holdSequence;
    const account = this.accountId;
    this.holdBusy = true;
    this.holdError = '';
    this.holdSuccess = '';
    this.hold = null;
    this.studio.inspectHold(ids.artistUserId, ids.commissionId)
      .pipe(takeUntil(this.destroy$)).subscribe({
        next: result => {
          if (!this.isCurrentAccount(account) || seq !== this.holdSequence) return;
          this.holdBusy = false;
          this.hold = result;
        },
        error: err => {
          if (!this.isCurrentAccount(account) || seq !== this.holdSequence) return;
          this.holdBusy = false;
          if (err instanceof HttpErrorResponse && err.status === 404) {
            this.holdError = 'Não existe retenção registrada para esses IDs, ou o pedido não foi encontrado.';
          } else {
            this.handleError(err, 'Não foi possível consultar a retenção.');
          }
        }
      });
  }

  placeHold(): void {
    if (!this.owner || this.holdBusy) return;
    const ids = this.holdIds();
    const reason = this.holdReason.trim();
    if (!ids || !reason || reason.length > 500) {
      this.holdError = 'Informe IDs válidos e uma justificativa com até 500 caracteres.';
      return;
    }
    if (!window.confirm(
      `Bloquear a exclusão da commission #${ids.commissionId} do artista #${ids.artistUserId}? ` +
      'A ação será auditada. Confirme a necessidade de retenção excepcional.'
    )) return;
    const seq = ++this.holdSequence;
    const account = this.accountId;
    this.holdBusy = true;
    this.holdError = '';
    this.holdSuccess = '';
    this.studio.placeHold({...ids, category:this.holdCategory,reason})
      .pipe(takeUntil(this.destroy$)).subscribe({
        next: result => {
          if (!this.isCurrentAccount(account) || seq !== this.holdSequence) return;
          this.holdBusy = false;
          this.hold = result;
          this.invalidateRetentionReport();
          this.holdSuccess = 'Retenção excepcional registrada com auditoria.';
        },
        error: err => {
          if (!this.isCurrentAccount(account) || seq !== this.holdSequence) return;
          this.holdBusy = false;
          this.handleError(err, 'Não foi possível registrar a retenção.');
        }
      });
  }

  releaseHold(): void {
    const hold = this.hold;
    const ids = this.holdIds();
    if (!this.owner || this.holdBusy || !hold?.active || !ids ||
        hold.artistUserId !== ids.artistUserId || hold.commissionId !== ids.commissionId) return;
    if (!window.confirm(
      `Liberar a retenção excepcional da commission #${ids.commissionId}? ` +
      'Ela poderá voltar a ser elegível para limpeza quando todos os requisitos forem cumpridos.'
    )) return;
    const seq = ++this.holdSequence;
    const account = this.accountId;
    this.holdBusy = true;
    this.holdError = '';
    this.holdSuccess = '';
    this.studio.releaseHold(ids.artistUserId, ids.commissionId)
      .pipe(takeUntil(this.destroy$)).subscribe({
        next: () => {
          if (!this.isCurrentAccount(account) || seq !== this.holdSequence) return;
          this.holdBusy = false;
          this.hold = {...hold,active:false};
          this.invalidateRetentionReport();
          this.holdSuccess = 'Retenção excepcional liberada e auditada.';
        },
        error: err => {
          if (!this.isCurrentAccount(account) || seq !== this.holdSequence) return;
          this.holdBusy = false;
          this.handleError(err, 'Não foi possível liberar a retenção.');
        }
      });
  }

  sourceLabel(source: CreatorPilotInvitation['sourceKind'] | string | null): string {
    switch (source) {
      case 'PILOT': return 'Piloto vitalício';
      case 'INVITE': return 'Convite Free';
      case 'BILLING': return 'Cobrança';
      default: return 'Sem convite';
    }
  }

  private change<T>(request: Observable<T>, success: string, targetId: number): void {
    const account = this.accountId;
    const seq = this.accountSequence;
    this.saving = true;
    this.errorMessage = '';
    this.successMessage = '';
    request.pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        if (!this.isCurrentAccount(account) || seq !== this.accountSequence) return;
        this.saving = false;
        this.successMessage = success;
        // A previous preview must never look current after a grant/revocation.
        if (this.candidate?.userId === targetId) {
          this.candidateSequence++;
          this.candidate = null;
          this.candidateInput = '';
        }
        this.loadParticipants();
      },
      error: error => {
        if (!this.isCurrentAccount(account) || seq !== this.accountSequence) return;
        this.saving = false;
        this.handleError(error, 'A alteração de acesso não foi confirmada.');
        // Preserve the failure message; refreshing here would erase it.
      }
    });
  }

  private isCurrent(seq: number, userId: number): boolean {
    return seq === this.accountSequence && this.isCurrentAccount(userId);
  }

  private isCurrentAccount(id: number | null): boolean {
    return id != null && id === this.accountId && this.users.getUser()?.id === id;
  }

  private handleError(error: unknown, message: string): void {
    if (error instanceof HttpErrorResponse && error.status === 403) {
      this.owner = false;
      this.candidate = null;
      this.participants = [];
      this.total = 0;
      this.invalidateRetentionReport();
      this.errorMessage = 'Você não tem autorização para gerenciar o piloto.';
      return;
    }
    if (error instanceof HttpErrorResponse && error.status === 404) {
      this.errorMessage = 'Conta não encontrada. Confira o ID informado.';
      return;
    }
    this.errorMessage = message;
  }
}
