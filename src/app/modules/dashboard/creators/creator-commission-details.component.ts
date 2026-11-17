import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { combineLatest, forkJoin, Observable, Subject, takeUntil } from 'rxjs';
import {
  CreatorActivity, CreatorActivityDraft, CreatorActivityKind,
  CreatorCommission, CreatorReference, CreatorReferenceDraft,
  CreatorStudioService
} from '../../../core/services/creator-studio.service';
import { UserService } from '../../../core/services/user.service';

/**
 * Private Pro commission detail page: reference links and artist-entered updates.
 * No unverified client approval is represented as authenticated.
 * API re-checks authorization and owner for EVERY operation.
 */
@Component({
  selector: 'app-creator-commission-details',
  standalone: false,
  templateUrl: './creator-commission-details.component.html'
})
export class CreatorCommissionDetailsComponent implements OnInit, OnDestroy {
  readonly kinds: { value: CreatorActivityKind; label: string }[] = [
    { value: 'NOTE', label: 'Observação' },
    { value: 'REVISION_REQUEST', label: 'Pedido de correção' },
    { value: 'CHANGE_RECORDED', label: 'Alteração realizada' },
    { value: 'CLIENT_FEEDBACK', label: 'Retorno informado pelo cliente' },
    { value: 'APPROVAL_REPORTED', label: 'Aprovação informada pelo artista' },
    { value: 'DELIVERY_RECORDED', label: 'Entrega registrada' }
  ];
  readonly activityPageSize = 20;

  loadingAccess = true;
  allowed = false;
  loading = false;
  error = '';
  actionError = '';
  notice = '';
  busy = false;

  commissionId: number | null = null;
  commission: CreatorCommission | null = null;
  references: CreatorReference[] = [];
  activity: CreatorActivity[] = [];
  totalActivity = 0;
  activityPage = 1;

  editingReferenceId: number | null = null;
  referenceDraft: CreatorReferenceDraft = { label: '', url: '' };
  activityDraft: CreatorActivityDraft = this.emptyActivity();

  private requestSequence = 0;
  private readonly destroy$ = new Subject<void>();

  constructor(private readonly studio: CreatorStudioService,
              private readonly users: UserService,
              private readonly route: ActivatedRoute) {}

  ngOnInit(): void {
    combineLatest([this.users.user$, this.route.paramMap])
      .pipe(takeUntil(this.destroy$))
      .subscribe(([user, params]) => {
        const seq = ++this.requestSequence;
        this.clearPrivateState();
        this.loadingAccess = user != null;
        const raw = params.get('id');
        const id = raw && /^[1-9]\d*$/.test(raw) ? Number(raw) : NaN;
        if (!user) {
          this.error = 'Entre na sua conta para consultar esta commission.';
          return;
        }
        if (!Number.isSafeInteger(id)) {
          this.loadingAccess = false;
          this.error = 'Pedido inválido.';
          return;
        }
        this.commissionId = id;
        const userId = user.id;
        this.studio.myAccess().pipe(takeUntil(this.destroy$)).subscribe({
          next: access => {
            if (!this.isCurrent(seq, userId, id)) return;
            this.loadingAccess = false;
            this.allowed = access.allowed && access.tier === 'PRO';
            if (this.allowed) this.load();
          },
          error: () => {
            if (!this.isCurrent(seq, userId, id)) return;
            this.loadingAccess = false;
            this.error = 'Não foi possível verificar seu acesso.';
          }
        });
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get activityPageCount(): number {
    return Math.max(1, Math.ceil(this.totalActivity / this.activityPageSize));
  }

  activityKindName(kind: CreatorActivityKind): string {
    return this.kinds.find(k => k.value === kind)?.label || kind;
  }

  formatCivilDate(value: string | null): string {
    if (!value) return '';
    const [year, month, day] = value.split('-');
    return year && month && day ? `${day}/${month}/${year}` : value;
  }

  private clearPrivateState(): void {
    this.loadingAccess = false;
    this.allowed = false;
    this.loading = false;
    this.busy = false;
    this.error = '';
    this.actionError = '';
    this.notice = '';
    this.commissionId = null;
    this.commission = null;
    this.references = [];
    this.activity = [];
    this.totalActivity = 0;
    this.activityPage = 1;
    this.cancelReference();
    this.activityDraft = this.emptyActivity();
  }

  private isCurrent(seq: number, userId: number, commissionId: number): boolean {
    return seq === this.requestSequence &&
      this.users.getUser()?.id === userId && this.commissionId === commissionId;
  }

  load(): void {
    const id = this.commissionId;
    if (!this.allowed || id === null) return;
    const seq = this.requestSequence;
    const userId = this.users.getUser()?.id;
    if (userId === undefined) return;
    this.loading = true;
    this.error = '';
    forkJoin({
      commission: this.studio.findCommission(id),
      references: this.studio.references(id),
      activity: this.studio.activity(id, this.activityPage, this.activityPageSize)
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: result => {
        if (!this.isCurrent(seq, userId, id)) return;
        this.commission = result.commission;
        this.references = result.references;
        this.activity = result.activity.items;
        this.totalActivity = result.activity.total;
        this.loading = false;
      },
      error: err => {
        if (!this.isCurrent(seq, userId, id)) return;
        this.loading = false;
        if (err instanceof HttpErrorResponse &&
            (err.status === 403 || err.status === 404)) {
          this.allowed = false;
          this.commission = null;
          this.references = [];
          this.activity = [];
          this.error = 'Acesso indisponível ou pedido não encontrado.';
        } else {
          this.error = 'Falha ao carregar os detalhes. Tente novamente.';
        }
      }
    });
  }

  editReference(ref: CreatorReference): void {
    if (!this.allowed || this.busy) return;
    this.editingReferenceId = ref.id;
    this.referenceDraft = { label: ref.label || '', url: ref.url };
    this.actionError = '';
  }

  cancelReference(): void {
    this.editingReferenceId = null;
    this.referenceDraft = {label: '', url: ''};
  }

  saveReference(): void {
    const id = this.commissionId;
    const url = this.referenceDraft.url.trim();
    if (!this.allowed || id === null || this.busy || !url) return;
    if (!/^https:\/\/[^\s]+$/i.test(url)) {
      this.actionError = 'A referência precisa começar com https://';
      return;
    }
    const input = {
      label: this.referenceDraft.label?.trim() || null,
      url
    };
    const request = this.editingReferenceId === null
      ? this.studio.createReference(id, input)
      : this.studio.updateReference(id, this.editingReferenceId, input);
    this.mutate(request, 'Referência salva.', () => this.cancelReference());
  }

  deleteReference(ref: CreatorReference): void {
    const id = this.commissionId;
    if (!this.allowed || id === null || this.busy ||
        !window.confirm('Excluir este link de referência?')) return;
    this.mutate(this.studio.deleteReference(id, ref.id), 'Referência removida.');
  }

  saveActivity(): void {
    const id = this.commissionId;
    const description = this.activityDraft.description.trim();
    if (!this.allowed || id === null || this.busy || !description ||
        !this.activityDraft.occurredOn) {
      this.actionError = 'Informe a data e descreva a atualização.';
      return;
    }
    const entry = { ...this.activityDraft, description };
    this.mutate(this.studio.createActivity(id, entry), 'Atualização registrada.', () => {
      this.activityDraft = this.emptyActivity();
      this.activityPage = 1;
    });
  }

  changeActivityPage(delta: number): void {
    const next = this.activityPage + delta;
    if (!this.allowed || this.loading || next < 1 || next > this.activityPageCount) return;
    this.activityPage = next;
    this.load();
  }

  private mutate<T>(call: Observable<T>, success: string, reset?: () => void): void {
    if (!this.allowed || this.busy || this.commissionId === null) return;
    const userId = this.users.getUser()?.id;
    const id = this.commissionId;
    const seq = this.requestSequence;
    if (userId === undefined) return;
    this.busy = true;
    this.actionError = '';
    this.notice = '';
    call.pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        if (!this.isCurrent(seq, userId, id)) return;
        this.busy = false;
        reset?.();
        this.notice = success;
        this.load();
      },
      error: err => {
        if (!this.isCurrent(seq, userId, id)) return;
        this.busy = false;
        if (err instanceof HttpErrorResponse && err.status === 403) {
          this.allowed = false;
          this.commission = null;
          this.references = [];
          this.activity = [];
          this.error = 'Seu acesso Pro não está ativo.';
          return;
        }
        this.actionError = 'Não foi possível salvar. Confira os dados e tente novamente.';
      }
    });
  }

  private emptyActivity(): CreatorActivityDraft {
    const now = new Date();
    const today = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0')
    ].join('-');
    return { eventKind: 'NOTE', description: '', occurredOn: today };
  }
}
