import { Component, OnDestroy, OnInit } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Subject, distinctUntilChanged, takeUntil } from 'rxjs';
import {
  CreatorCommission,
  CreatorCommissionInput,
  CreatorCommissionStatus,
  CreatorStudioAccess,
  CreatorStudioService
} from '../../../core/services/creator-studio.service';
import { UserService } from '../../../core/services/user.service';

/**
 * The first private Pro workflow: a fast commission card and chronological queue.
 * Backend always re-checks entitlement and ownership; UI checks only control display.
 */
@Component({
  selector: 'app-creator-studio',
  standalone: false,
  templateUrl: './creator-studio.component.html'
})
export class CreatorStudioComponent implements OnInit, OnDestroy {
  readonly statuses: { value: CreatorCommissionStatus; label: string }[] = [
    { value: 'QUEUED', label: 'Na fila' },
    { value: 'IN_PROGRESS', label: 'Em produção' },
    { value: 'WAITING', label: 'Aguardando retorno' },
    { value: 'PAUSED', label: 'Em pausa' },
    { value: 'COMPLETED', label: 'Concluída' }
  ];
  readonly pageSize = 25;

  loadingAccess = true;
  access: CreatorStudioAccess | null = null;
  accessError = '';
  loading = false;
  errorMessage = '';
  saving = false;
  saveError = '';
  changingId: number | null = null;
  commissions: CreatorCommission[] = [];
  total = 0;
  page = 1;
  selectedStatus: CreatorCommissionStatus | 'ACTIVE' = 'ACTIVE';

  formOpen = false;
  editingId: number | null = null;
  form: CreatorCommissionInput = this.emptyForm();

  private accessSequence = 0;
  private listSequence = 0;
  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly creatorStudio: CreatorStudioService,
    private readonly users: UserService
  ) {}

  ngOnInit(): void {
    this.users.user$
      .pipe(
        distinctUntilChanged((a, b) => a?.id === b?.id),
        takeUntil(this.destroy$)
      )
      .subscribe(user => {
        const sequence = ++this.accessSequence;
        this.listSequence++;
        this.access = null;
        this.accessError = '';
        this.loadingAccess = user !== null;
        this.commissions = [];
        this.total = 0;
        this.page = 1;
        this.formOpen = false;
        this.editingId = null;
        this.saving = false;
        this.changingId = null;
        if (!user) {
          this.accessError = 'Entre na sua conta para acessar o Creator Studio.';
          return;
        }
        const userId = user.id;
        this.creatorStudio.myAccess().pipe(takeUntil(this.destroy$)).subscribe({
          next: access => {
            if (this.accessSequence !== sequence || this.users.getUser()?.id !== userId) return;
            this.loadingAccess = false;
            this.access = access;
            if (this.canUsePro) this.reload();
          },
          error: () => {
            if (this.accessSequence !== sequence || this.users.getUser()?.id !== userId) return;
            this.loadingAccess = false;
            this.accessError = 'Não foi possível verificar seu acesso. Tente novamente.';
          }
        });
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get canUsePro(): boolean {
    return this.access?.allowed === true && this.access.tier === 'PRO';
  }

  get pageCount(): number {
    return Math.max(1, Math.ceil(this.total / this.pageSize));
  }

  statusLabel(status: CreatorCommissionStatus): string {
    return this.statuses.find(option => option.value === status)?.label ?? status;
  }

  formatCivilDate(date: string | null): string {
    if (!date) return '';
    const [year, month, day] = date.split('-');
    return year && month && day ? `${day}/${month}/${year}` : date;
  }

  reload(): void {
    if (!this.canUsePro) return;
    const seq = ++this.listSequence;
    const userId = this.users.getUser()?.id;
    this.errorMessage = '';
    this.loading = true;
    this.creatorStudio.commissions(
      this.selectedStatus === 'ACTIVE' ? null : this.selectedStatus,
      this.page,
      this.pageSize
    ).pipe(takeUntil(this.destroy$)).subscribe({
      next: result => {
        if (seq !== this.listSequence || this.users.getUser()?.id !== userId) return;
        this.commissions = result.items;
        this.total = result.total;
        this.loading = false;
      },
      error: error => {
        if (seq !== this.listSequence || this.users.getUser()?.id !== userId) return;
        this.loading = false;
        this.errorMessage = error instanceof HttpErrorResponse && error.status === 403
          ? 'Seu acesso ao Pro não está mais ativo. Recarregue a página para verificar.'
          : 'Não conseguimos carregar a fila. Tente novamente.';
      }
    });
  }

  filterChanged(): void {
    this.page = 1;
    this.reload();
  }

  previousPage(): void {
    if (this.page <= 1 || this.loading) return;
    this.page--;
    this.reload();
  }

  nextPage(): void {
    if (this.page >= this.pageCount || this.loading) return;
    this.page++;
    this.reload();
  }

  newCommission(): void {
    if (!this.canUsePro) return;
    this.editingId = null;
    this.form = this.emptyForm();
    this.formOpen = true;
    this.saveError = '';
  }

  editCommission(commission: CreatorCommission): void {
    if (!this.canUsePro) return;
    this.editingId = commission.id;
    this.form = {
      title: commission.title,
      clientName: commission.clientName,
      description: commission.description ?? '',
      privateNotes: commission.privateNotes ?? '',
      requestedOn: commission.requestedOn,
      dueOn: commission.dueOn,
      artTypeId: commission.artTypeId
    };
    this.formOpen = true;
    this.saveError = '';
  }

  closeForm(): void {
    if (this.saving) return;
    this.formOpen = false;
    this.editingId = null;
    this.saveError = '';
  }

  save(): void {
    if (!this.canUsePro || this.saving) return;
    const title = this.form.title.trim();
    const clientName = this.form.clientName.trim();
    if (!title || !clientName || !this.form.requestedOn) {
      this.saveError = 'Informe o título, o cliente e a data original do pedido.';
      return;
    }
    const data: CreatorCommissionInput = {
      ...this.form,
      title,
      clientName,
      description: this.form.description?.trim() || null,
      privateNotes: this.form.privateNotes?.trim() || null,
      dueOn: this.form.dueOn || null
    };
    this.saving = true;
    this.saveError = '';
    const operation = this.editingId === null
      ? this.creatorStudio.create(data)
      : this.creatorStudio.update(this.editingId, data);
    const userId = this.users.getUser()?.id;
    operation.pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        if (this.users.getUser()?.id !== userId) return;
        this.saving = false;
        this.formOpen = false;
        this.editingId = null;
        this.page = 1;
        this.reload();
      },
      error: error => {
        if (this.users.getUser()?.id !== userId) return;
        this.saving = false;
        this.saveError = error instanceof HttpErrorResponse && error.status === 403
          ? 'Sua assinatura Pro não está ativa.'
          : 'Não foi possível salvar. Confira os campos e tente novamente.';
      }
    });
  }

  changeStatus(commission: CreatorCommission, status: CreatorCommissionStatus): void {
    if (!this.canUsePro || this.changingId !== null || commission.status === status) return;
    this.changingId = commission.id;
    this.errorMessage = '';
    const userId = this.users.getUser()?.id;
    this.creatorStudio.changeStatus(commission.id, status)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          if (this.users.getUser()?.id !== userId) return;
          this.changingId = null;
          // Completion is not deletion: the server excludes it from the active queue.
          this.reload();
        },
        error: () => {
          if (this.users.getUser()?.id !== userId) return;
          this.changingId = null;
          this.errorMessage = 'Não foi possível atualizar o status. Tente novamente.';
        }
      });
  }

  trackById(_: number, item: CreatorCommission): number {
    return item.id;
  }

  private emptyForm(): CreatorCommissionInput {
    const now = new Date();
    const today = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0')
    ].join('-');
    return {
      title: '',
      clientName: '',
      description: '',
      privateNotes: '',
      requestedOn: today,
      dueOn: null,
      artTypeId: null
    };
  }
}
