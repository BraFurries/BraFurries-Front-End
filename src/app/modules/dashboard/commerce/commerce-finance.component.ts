import { Component, OnDestroy, OnInit } from '@angular/core';
import { Observable, Subject, forkJoin, of, takeUntil, catchError } from 'rxjs';
import { PlatformAccess, PlatformAccessService, CommercePermissionCode } from
  '../../../core/services/platform-access.service';
import {
  CommerceBatchForSale, CommerceFinanceService, CommercePhysicalSale, CommerceRoyaltyEvent,
  CommerceStatement, CommerceStatementItem, CommercePayment, CommerceSaleItem, SaleLineInput,
  CommerceCashMovement, CommerceCashSummary, CashMovementType, ContributionNature, ContributionSource
} from '../../../core/services/commerce-finance.service';

type FinanceTab = 'sales' | 'royalties' | 'statements' | 'cash';

interface SaleDraftLine {
  batchId: number | null;
  quantity: number;
  unitPrice: number;
}

function brazilToday(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const field = (type: string) => parts.find(p => p.type === type)?.value || '01';
  return `${field('year')}-${field('month')}-${field('day')}`;
}

/**
 * UI-only permission hints. Every API endpoint independently verifies grants,
 * settlement state, historical snapshots and batch availability.
 */
@Component({
  selector: 'app-commerce-finance',
  standalone: false,
  templateUrl: './commerce-finance.component.html'
})
export class CommerceFinanceComponent implements OnInit, OnDestroy {
  readonly tabs: { key: FinanceTab; label: string; permissions: CommercePermissionCode[] }[] = [
    { key: 'sales', label: 'Vendas físicas', permissions: ['SALES_MANAGE'] },
    { key: 'royalties', label: 'Royalties', permissions: ['FINANCE_VIEW'] },
    { key: 'statements', label: 'Fechamentos e repasses', permissions: ['FINANCE_VIEW'] },
    { key: 'cash', label: 'Caixa, despesas e aportes', permissions: ['FINANCE_VIEW'] }
  ];

  access: PlatformAccess | null = null;
  activeTab: FinanceTab = 'sales';
  loading = true;
  saving = false;
  errorMessage = '';
  successMessage = '';
  batches: CommerceBatchForSale[] = [];
  sales: CommercePhysicalSale[] = [];
  saleDetails: CommerceSaleItem[] = [];
  selectedSaleId: number | null = null;
  royalties: CommerceRoyaltyEvent[] = [];
  statements: CommerceStatement[] = [];
  statementDetails: CommerceStatementItem[] = [];
  payments: CommercePayment[] = [];
  selectedStatementId: number | null = null;
  cashMovements: CommerceCashMovement[] = [];
  cashSummary: CommerceCashSummary | null = null;
  cashReversalId: number | null = null;
  cashReversalReason = '';

  periodYear = Number(brazilToday().slice(0, 4));
  periodMonth = Number(brazilToday().slice(5, 7));
  statementArtistId: number | null = null;

  saleRequestKey = '';
  saleChannel: 'EVENT' | 'DIRECT' | 'ONLINE' | 'OTHER' = 'DIRECT';
  saleReference = '';
  buyerLabel = '';
  saleDate = brazilToday();
  saleNotes = '';
  salePaymentMethod = 'PIX';
  saleProcessingProvider = '';
  saleProcessingFeePercent = 0;
  saleProcessingFeeFixed = 0;
  saleLines: SaleDraftLine[] = [];

  cashRequestKey = '';
  cashForm: {
    movementType: CashMovementType;
    amount: number;
    occurredOn: string;
    category: string;
    description: string;
    counterpartyLabel: string;
    counterpartyUserId: number | null;
    contributorType: ContributionSource;
    contributionNature: ContributionNature;
    paymentMethod: string;
    externalReference: string;
    notes: string;
  } = {
    movementType: 'EXPENSE', amount: 0, occurredOn: brazilToday(),
    category: 'MATERIAIS', description: '', counterpartyLabel: '',
    counterpartyUserId: null, contributorType: 'OWNER',
    contributionNature: 'NON_REPAYABLE',
    paymentMethod: 'PIX',externalReference: '',notes: ''
  };
  cancellationTarget: number | null = null;
  cancellationReason = '';

  paymentRequestKey = '';
  paymentAmount = 0;
  paymentDate = brazilToday();
  paymentReference = '';
  paymentNotes = '';

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly authorizer: PlatformAccessService,
    private readonly finance: CommerceFinanceService
  ) {}

  ngOnInit(): void {
    this.authorizer.myAccess().pipe(takeUntil(this.destroy$)).subscribe({
      next: access => {
        this.access = access;
        this.activeTab = this.visibleTabs()[0]?.key ?? 'sales';
        this.reload();
      },
      error: () => {
        this.errorMessage = 'Não foi possível verificar o acesso financeiro.';
        this.loading = false;
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  can(permission: CommercePermissionCode): boolean {
    return this.access?.enabled === true &&
      (this.access.owner || this.access.permissions.includes(permission));
  }

  visibleTabs(): typeof this.tabs {
    return this.tabs.filter(tab => tab.permissions.every(code => this.can(code)));
  }

  get artistChoices(): { id: number; name: string }[] {
    const names = new Map<number,string>();
    for (const event of this.royalties) {
      names.set(event.artistUserId,event.artistName);
    }
    return [...names.entries()].map(([id,name]) => ({ id,name }));
  }

  get selectedStatement(): CommerceStatement | undefined {
    return this.statements.find(s => s.id === this.selectedStatementId);
  }

  get statementBalance(): number | null {
    const statement = this.selectedStatement;
    return statement ? Math.max(0,statement.totalAmount - statement.paidAmount) : null;
  }

  get selectedSale(): CommercePhysicalSale | undefined {
    return this.sales.find(s => s.id === this.selectedSaleId);
  }

  selectTab(tab: FinanceTab): void {
    if (!this.visibleTabs().some(item => item.key === tab)) return;
    this.activeTab = tab;
    this.errorMessage = '';
    this.successMessage = '';
  }

  reload(): void {
    if (!this.access?.enabled) {
      this.loading = false;
      return;
    }
    this.loading = true;
    this.errorMessage = '';
    const canReadSales = this.can('SALES_MANAGE') || this.can('FINANCE_VIEW');
    forkJoin({
      batches: this.safe(this.can('SALES_MANAGE') ? this.finance.availableBatches() : of([])),
      sales: this.safe(canReadSales ? this.finance.sales() : of([])),
      royalties: this.safe(this.can('FINANCE_VIEW') ?
        this.finance.royalties(this.periodYear,this.periodMonth) : of([])),
      statements: this.safe(this.can('FINANCE_VIEW') ?
        this.finance.statements(this.periodYear,this.periodMonth) : of([])),
      cashMovements: this.safe(this.can('FINANCE_VIEW') ?
        this.finance.cashMovements(this.periodYear,this.periodMonth) : of([])),
      cashSummary: this.can('FINANCE_VIEW')
        ? this.finance.cashSummary(this.periodYear,this.periodMonth).pipe(
            catchError(() => {
              this.errorMessage = 'Não foi possível carregar o resumo financeiro.';
              return of(null);
            }))
        : of(null)
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: ({ batches, sales, royalties, statements, cashMovements, cashSummary }) => {
        this.batches = batches;
        this.sales = sales;
        this.royalties = royalties;
        this.statements = statements;
        this.cashMovements = cashMovements;
        this.cashSummary = cashSummary;
        this.loading = false;
        if (this.selectedStatementId != null &&
            !statements.some(s => s.id === this.selectedStatementId)) {
          this.selectedStatementId = null;
          this.statementDetails = [];
          this.payments = [];
        }
        if (this.selectedStatementId != null) this.loadStatementDetails();
      },
      error: () => {
        this.loading = false;
        this.errorMessage = 'Falha ao carregar os dados financeiros.';
      }
    });
  }

  private safe<T>(request: Observable<T>): Observable<T> {
    return request.pipe(catchError(() => {
      this.errorMessage = 'Algumas informações não puderam ser carregadas.';
      return of([] as unknown as T);
    }));
  }

  addSaleLine(): void {
    if (!this.can('SALES_MANAGE')) return;
    const first = this.batches.find(b =>
      !this.saleLines.some(x => x.batchId === b.batchId));
    if (!first) {
      this.errorMessage = 'Não há outros lotes disponíveis para incluir na venda.';
      return;
    }
    this.saleLines.push({
      batchId: first.batchId,quantity: 1,unitPrice: first.suggestedPrice
    });
  }

  onBatchSelected(line: SaleDraftLine): void {
    const batch = this.batches.find(b => b.batchId === line.batchId);
    if (batch) line.unitPrice = batch.suggestedPrice;
  }

  removeSaleLine(index: number): void {
    this.saleLines.splice(index,1);
  }

  createSale(): void {
    if (!this.can('SALES_MANAGE') || this.saleLines.length === 0) {
      this.errorMessage = 'Adicione pelo menos um lote à venda.';
      return;
    }
    const items: SaleLineInput[] = [];
    const ids = new Set<number>();
    for (const line of this.saleLines) {
      if (line.batchId == null || !Number.isInteger(line.quantity) || line.quantity <= 0
        || !Number.isFinite(line.unitPrice) || line.unitPrice < 0
        || ids.has(line.batchId)) {
        this.errorMessage = 'Confira os lotes, quantidades, preços e eventuais duplicidades.';
        return;
      }
      ids.add(line.batchId);
      items.push({batchId: line.batchId,quantity: line.quantity,unitPrice: line.unitPrice});
    }
    if (!this.saleRequestKey) this.saleRequestKey = crypto.randomUUID();
    this.mutate(this.finance.createSale({
      requestKey: this.saleRequestKey,channel: this.saleChannel,
      externalReference: this.saleReference.trim() || null,
      buyerLabel: this.buyerLabel.trim() || null,soldOn: this.saleDate,
      notes: this.saleNotes.trim() || null,items,
      paymentMethod: this.salePaymentMethod,
      processingProvider: this.saleProcessingProvider.trim() || null,
      processingFeePercent: this.saleProcessingFeePercent,
      processingFeeFixed: this.saleProcessingFeeFixed
    }), 'Venda registrada e royalties apurados.', () => {
      this.saleRequestKey = '';
      this.saleLines = [];
      this.saleReference = '';
      this.buyerLabel = '';
      this.saleNotes = '';
      this.saleProcessingProvider = '';
      this.saleProcessingFeePercent = 0;
      this.saleProcessingFeeFixed = 0;
    });
  }

  selectSale(sale: CommercePhysicalSale): void {
    if (!this.can('SALES_MANAGE') && !this.can('FINANCE_VIEW')) return;
    this.selectedSaleId = sale.id;
    this.finance.saleItems(sale.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: items => this.saleDetails = items,
      error: () => this.errorMessage = 'Não foi possível carregar os itens da venda.'
    });
  }

  startCancel(sale: CommercePhysicalSale): void {
    if (!this.can('SALES_MANAGE') || sale.status !== 'CONFIRMED') return;
    this.cancellationTarget = sale.id;
    this.cancellationReason = '';
  }

  cancelSale(): void {
    if (!this.can('SALES_MANAGE') || this.cancellationTarget == null) return;
    if (this.cancellationReason.trim().length < 3) {
      this.errorMessage = 'Informe um motivo para o cancelamento.';
      return;
    }
    if (!window.confirm('Confirmar cancelamento integral? O estoque retorna ao lote e os royalties são estornados apenas se ainda não fechados.')) {
      return;
    }
    const id=this.cancellationTarget;
    this.mutate(this.finance.cancelSale(id,this.cancellationReason.trim()),
      'Venda cancelada com estorno contábil.',() => {
        this.cancellationTarget = null;
        this.cancellationReason = '';
      });
  }

  changePeriod(): void {
    if (!this.can('FINANCE_VIEW')) return;
    this.selectedStatementId = null;
    this.statementDetails = [];
    this.payments = [];
    this.statementArtistId = null;
    this.reload();
  }

  createDraft(): void {
    if (!this.can('SETTLEMENTS_MANAGE') || !this.can('FINANCE_VIEW')
      || this.statementArtistId == null) return;
    this.mutate(this.finance.createStatement(
      this.statementArtistId,this.periodYear,this.periodMonth
    ),'Demonstrativo mensal criado. Revise antes de aprovar.');
  }

  selectStatement(statement: CommerceStatement): void {
    if (!this.can('FINANCE_VIEW')) return;
    this.selectedStatementId = statement.id;
    this.loadStatementDetails();
  }

  private loadStatementDetails(): void {
    if (!this.can('FINANCE_VIEW') || this.selectedStatementId == null) return;
    const id=this.selectedStatementId;
    forkJoin({
      items:this.finance.statementItems(id),
      payments:this.finance.payments(id)
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: ({items,payments}) => {
        if (this.selectedStatementId !== id) return;
        this.statementDetails = items;
        this.payments = payments;
      },
      error: () => this.errorMessage = 'Falha ao carregar o demonstrativo.'
    });
  }

  approveStatement(): void {
    const statement=this.selectedStatement;
    if (!this.can('SETTLEMENTS_MANAGE') || !this.can('FINANCE_VIEW')
      || !statement || statement.status !== 'DRAFT') return;
    if (!window.confirm('Aprovar definitivamente este fechamento mensal? Os lançamentos e valores ficarão congelados.')) {
      return;
    }
    this.mutate(this.finance.approveStatement(statement.id),
      'Fechamento aprovado.');
  }

  discardStatement(): void {
    const statement=this.selectedStatement;
    if (!this.can('SETTLEMENTS_MANAGE') || !this.can('FINANCE_VIEW')
      || !statement || statement.status !== 'DRAFT') return;
    if (!window.confirm('Descartar o rascunho? O período será reaberto para correção das vendas.')) {
      return;
    }
    this.mutate(this.finance.discardStatement(statement.id),
      'Rascunho descartado.',() => {
        this.selectedStatementId = null;
        this.statementDetails = [];
        this.payments = [];
      });
  }

  recordPayment(): void {
    const statement=this.selectedStatement;
    if (!this.can('PAYMENTS_RECORD') || !this.can('FINANCE_VIEW') || !statement
      || !['APPROVED','PARTIALLY_PAID'].includes(statement.status)) return;
    if (!Number.isFinite(this.paymentAmount) || this.paymentAmount <= 0
      || this.paymentAmount > (this.statementBalance ?? 0) ||
      !this.paymentReference.trim()) {
      this.errorMessage = 'Informe um pagamento válido, com referência, que não exceda o saldo.';
      return;
    }
    if (!window.confirm('A transferência já foi realizada fora da plataforma? Registrar pagamento não envia dinheiro.')) {
      return;
    }
    if (!this.paymentRequestKey) this.paymentRequestKey=crypto.randomUUID();
    this.mutate(this.finance.recordPayment(statement.id,{
      requestKey: this.paymentRequestKey,amount:this.paymentAmount,
      paidOn:this.paymentDate,externalReference:this.paymentReference.trim(),
      notes:this.paymentNotes.trim() || null
    }), 'Pagamento externo registrado com auditoria.',() => {
      this.paymentRequestKey='';
      this.paymentAmount=0;
      this.paymentReference='';
      this.paymentNotes='';
    });
  }

  createCashMovement(): void {
    if (!this.can('CASHFLOW_MANAGE') || !this.can('FINANCE_VIEW')) return;
    const form=this.cashForm;
    if (!Number.isFinite(form.amount) || form.amount <= 0
        || !form.category.trim() || !form.description.trim()
        || !form.counterpartyLabel.trim()) {
      this.errorMessage = 'Informe valor, categoria, descrição e origem/destino.';
      return;
    }
    if (!this.cashRequestKey) this.cashRequestKey=crypto.randomUUID();
    this.mutate(this.finance.createCashMovement({
      requestKey:this.cashRequestKey,
      movementType:form.movementType,
      amount:form.amount,
      occurredOn:form.occurredOn,
      category:form.category.trim(),
      description:form.description.trim(),
      counterpartyLabel:form.counterpartyLabel.trim(),
      counterpartyUserId:form.counterpartyUserId,
      contributorType:form.movementType === 'CONTRIBUTION' ? form.contributorType : null,
      contributionNature:form.movementType === 'CONTRIBUTION' ? form.contributionNature : null,
      paymentMethod:form.paymentMethod,
      externalReference:form.externalReference.trim() || null,
      notes:form.notes.trim() || null
    }), 'Movimentação registrada com histórico e auditoria.', () => {
      this.cashRequestKey = '';
      this.cashForm.amount = 0;
      this.cashForm.description = '';
      this.cashForm.counterpartyLabel = '';
      this.cashForm.counterpartyUserId = null;
      this.cashForm.externalReference = '';
      this.cashForm.notes = '';
    });
  }

  startCashReversal(movement: CommerceCashMovement): void {
    if (!this.can('CASHFLOW_MANAGE') || !this.can('FINANCE_VIEW')
        || movement.eventKind !== 'POSTED') return;
    this.cashReversalId = movement.id;
    this.cashReversalReason = '';
  }

  reverseCashMovement(): void {
    if (!this.can('CASHFLOW_MANAGE') || !this.can('FINANCE_VIEW')
        || this.cashReversalId == null || this.cashReversalReason.trim().length < 3) {
      this.errorMessage = 'Informe um motivo válido para o estorno.';
      return;
    }
    if (!window.confirm('Confirmar estorno compensatório? O lançamento original permanecerá no histórico.')) {
      return;
    }
    this.mutate(this.finance.reverseCashMovement(
      this.cashReversalId,this.cashReversalReason.trim()
    ), 'Movimentação estornada sem apagar o histórico.', () => {
      this.cashReversalId = null;
      this.cashReversalReason = '';
    });
  }

  private mutate(request: Observable<unknown>,message: string,after?: () => void): void {
    if (this.saving) return;
    this.saving = true;
    this.errorMessage = '';
    this.successMessage = '';
    request.pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.saving = false;
        this.successMessage = message;
        after?.();
        this.reload();
      },
      error: error => {
        this.saving = false;
        this.errorMessage = error?.error?.message ||
          'O registro não foi confirmado. Verifique o histórico antes de repetir.';
      }
    });
  }
}
