import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { distinctUntilChanged, Observable, Subject, takeUntil } from 'rxjs';
import { PlatformAccessService } from '../../../core/services/platform-access.service';
import {
  CreatorPilotCandidate, CreatorPilotFilter, CreatorPilotInvitation,
  CreatorStudioPilotAdminService
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
    const userId = Number(String(this.candidateInput).trim());
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
        this.loadParticipants();
        if (this.candidate?.userId === targetId) {
          this.lookupCandidate();
        }
      },
      error: error => {
        if (!this.isCurrentAccount(account) || seq !== this.accountSequence) return;
        this.saving = false;
        this.handleError(error, 'A alteração de acesso não foi confirmada.');
        if (this.owner) this.loadParticipants();
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
