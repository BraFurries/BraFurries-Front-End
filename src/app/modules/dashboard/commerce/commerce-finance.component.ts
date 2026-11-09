import { Component, OnDestroy, OnInit } from '@angular/core';
import { Observable, Subject, forkJoin, of, takeUntil, catchError } from 'rxjs';
import { PlatformAccess, PlatformAccessService, PlatformPermissionCode } from
  '../../../core/services/platform-access.service';
import {
  CommerceBatchForSale, CommerceFinanceService, CommercePhysicalSale, CommerceRoyaltyEvent,
  CommerceStatement, CommerceStatementItem, CommercePayment, CommerceSaleItem, SaleLineInput,
  CommerceCashMovement, CommerceCashSummary, CashMovementType, ContributionNature, ContributionSource,
  CommercePaymentMetadataRevision, CommerceCashMetadataRevision,
  CommerceOrder, CommerceOrderItem, CommerceOrderLineInput, CommerceOrderPayment, CommerceOrderStatus,
  CommerceOrderProductChoice
} from '../../../core/services/commerce-finance.service';

type FinanceTab = 'sales' | 'orders' | 'royalties' | 'statements' | 'cash';

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
  readonly tabs: { key: FinanceTab; label: string; permissions: PlatformPermissionCode[] }[] = [
    { key: 'sales', label: 'Vendas físicas', permissions: ['SALES_MANAGE'] },
    { key: 'orders', label: 'Encomendas', permissions: ['SALES_MANAGE'] },
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
  orders: CommerceOrder[] = [];
  orderProductChoices: CommerceOrderProductChoice[] = [];
  orderItems: CommerceOrderItem[] = [];
  orderPayments: CommerceOrderPayment[] = [];
  selectedOrderId: number | null = null;
  editingOrderId: number | null = null;
  orderRequestKey = '';
  orderBuyer = '';
  orderChannel: 'EVENT' | 'DIRECT' | 'ONLINE' | 'OTHER' = 'DIRECT';
  orderReference = '';
  orderDate = brazilToday();
  orderDueDate = '';
  orderNotes = '';
  orderDraftLines: CommerceOrderLineInput[] = [];
  orderDeliveryDate = brazilToday();
  orderCancellationReason = '';
  orderReceiptKey = '';
  orderReceiptAmount = 0;
  orderReceiptDate = brazilToday();
  orderReceiptMethod = 'PIX';
  orderReceiptReference = '';
  orderReceiptNotes = '';
  orderReversalReason = '';
  orderReversalKey = '';
  orderReversalDate = '';
  orderReversalTargetId: number | null = null;
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
  editingCashMetadataId: number | null = null;
  cashMetadataDescription = '';
  cashMetadataReference = '';
  cashMetadataNotes = '';
  cashMetadataReason = '';
  cashMetadataHistoryId: number | null = null;
  cashMetadataHistoryRows: CommerceCashMetadataRevision[] = [];
  cashMetadataHistoryLoading = false;

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
  reversingArtistPaymentId: number | null = null;
  reversingArtistPaymentReason = '';
  reversingArtistPaymentDate = brazilToday();
  editingPaymentMetadataId: number | null = null;
  paymentMetadataReference = '';
  paymentMetadataNotes = '';
  paymentMetadataReason = '';
  paymentMetadataHistoryId: number | null = null;
  paymentMetadataHistoryRows: CommercePaymentMetadataRevision[] = [];
  paymentMetadataHistoryLoading = false;

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

  can(permission: PlatformPermissionCode): boolean {
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

  get selectedOrder(): CommerceOrder | undefined {
    return this.orders.find(o => o.id === this.selectedOrderId);
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
      orders: this.safe(this.can('SALES_MANAGE') ? this.finance.orders() : of([])),
      orderChoices: this.safe(this.can('SALES_MANAGE') ? this.finance.orderProductChoices() : of([])),
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
      next: ({ batches, sales, orders, orderChoices, royalties, statements, cashMovements, cashSummary }) => {
        this.batches = batches;
        this.sales = sales;
        this.orders = orders;
        this.orderProductChoices = orderChoices;
        if (this.selectedOrderId != null && !orders.some(o => o.id === this.selectedOrderId)) {
          this.selectedOrderId = null;
          this.orderItems = [];
          this.orderPayments = [];
        }
        if (this.selectedOrderId != null) this.loadOrderDetails();
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


  addOrderLine(): void {
    if (!this.can('SALES_MANAGE')) return;
    this.orderDraftLines.push({ productId:null,label:'',size:null,quantity:1,unitPrice:0 });
  }

  onOrderProductSelected(line: CommerceOrderLineInput): void {
    const product = this.orderProductChoices.find(item => item.id === line.productId);
    if (product) {
      line.label = product.name;
      line.unitPrice = product.suggestedPrice;
    }
  }

  removeOrderLine(index: number): void {
    this.orderDraftLines.splice(index,1);
  }

  createOrder(): void {
    if (!this.can('SALES_MANAGE') || !this.orderBuyer.trim() ||
        !this.orderDraftLines.length || !this.orderDate) {
      this.errorMessage = 'Informe comprador, data e pelo menos um item.';
      return;
    }
    const lines = this.orderDraftLines.map(item => ({
      productId: item.productId || null,
      label: item.label.trim(),
      size: item.size?.trim() || null,
      quantity: item.quantity,
      unitPrice: item.unitPrice
    }));
    if (lines.some(item => !item.label || !Number.isInteger(item.quantity) ||
        item.quantity < 1 || item.quantity > 100000 ||
        !Number.isFinite(item.unitPrice) || item.unitPrice < 0 ||
        Math.abs(Math.round(item.unitPrice * 100) - item.unitPrice * 100) > 0.0000001 ||
        (item.productId != null && (!Number.isInteger(item.productId) || item.productId < 1)))) {
      this.errorMessage = 'Revise descrições, tamanhos, quantidades e preços.';
      return;
    }
    const payload={
      buyerLabel:this.orderBuyer.trim(),channel:this.orderChannel,
      externalReference:this.orderReference.trim() || null,
      orderedOn:this.orderDate,expectedDeliveryOn:this.orderDueDate || null,
      notes:this.orderNotes.trim() || null,items:lines
    };
    const editing=this.editingOrderId;
    if(editing==null && !this.orderRequestKey) this.orderRequestKey=crypto.randomUUID();
    const request: Observable<unknown>=editing==null
      ? this.finance.createOrder({...payload,requestKey:this.orderRequestKey})
      : this.finance.updateOrder(editing,payload);
    this.mutate(request,editing==null
      ? 'Encomenda cadastrada sem movimentação de estoque ou royalties.'
      : 'Encomenda aberta corrigida; histórico financeiro preservado.', () => {
      this.cancelEditOrder();
    });
  }

  editOpenOrder(order: CommerceOrder): void {
    if(!this.can('SALES_MANAGE') || this.saving || order.status!=='OPEN') return;
    // Net paid = zero is insufficient: reversed receipts also freeze the
    // original order amount. The API rechecks this under the order lock.
    forkJoin({
      items:this.finance.orderItems(order.id),
      payments:this.finance.orderPayments(order.id)
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next:({items,payments})=>{
        if(payments.length) {
          this.errorMessage='Há recebimentos registrados nesta encomenda. Não é possível alterar valores.';
          return;
        }
        this.editingOrderId=order.id;
        this.orderBuyer=order.buyerLabel;
        this.orderChannel=order.channel as 'EVENT'|'DIRECT'|'ONLINE'|'OTHER';
        this.orderReference=order.externalReference || '';
        this.orderDate=order.orderedOn;
        this.orderDueDate=order.expectedDeliveryOn || '';
        this.orderNotes=order.notes || '';
        this.orderDraftLines=items.map(item=>({
          productId:item.productId,label:item.label,size:item.size,
          quantity:item.quantity,unitPrice:item.unitPrice
        }));
        this.errorMessage='';
      },
      error:()=>this.errorMessage='Não foi possível carregar os dados para correção.'
    });
  }

  cancelEditOrder(): void {
    this.editingOrderId=null;
    this.orderRequestKey='';
    this.orderBuyer='';
    this.orderChannel='DIRECT';
    this.orderReference='';
    this.orderDate=brazilToday();
    this.orderDueDate='';
    this.orderNotes='';
    this.orderDraftLines=[];
  }

  deleteUnusedOrder(order: CommerceOrder): void {
    if(!this.can('SALES_MANAGE') || this.saving || order.status!=='OPEN' ||
       !window.confirm('Excluir definitivamente esta encomenda sem recebimentos?')) return;
    this.mutate(this.finance.deleteUnusedOrder(order.id),
      'Encomenda nunca utilizada excluída.',()=>{
        if(this.editingOrderId===order.id) this.cancelEditOrder();
        if(this.selectedOrderId===order.id) this.selectedOrderId=null;
      });
  }

  selectOrder(order: CommerceOrder): void {
    if (!this.can('SALES_MANAGE')) return;
    this.selectedOrderId = order.id;
    this.orderReceiptKey = '';
    this.orderReversalKey = '';
    this.orderReversalDate = '';
    this.orderReversalTargetId = null;
    this.loadOrderDetails();
  }

  private loadOrderDetails(): void {
    if (!this.can('SALES_MANAGE') || this.selectedOrderId == null) return;
    const id = this.selectedOrderId;
    forkJoin({
      items:this.finance.orderItems(id),
      payments:this.finance.orderPayments(id)
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: ({items,payments}) => {
        if (this.selectedOrderId !== id) return;
        this.orderItems = items;
        this.orderPayments = payments;
      },
      error: () => this.errorMessage = 'Falha ao carregar os detalhes da encomenda.'
    });
  }

  changeOrderStatus(status: CommerceOrderStatus): void {
    const order = this.selectedOrder;
    if (!this.can('SALES_MANAGE') || !order) return;
    const reason = status === 'CANCELLED' ? this.orderCancellationReason.trim() : null;
    if (status === 'CANCELLED' && (!reason || reason.length < 3)) {
      this.errorMessage = 'Informe um motivo de cancelamento.';
      return;
    }
    if (!window.confirm('Confirmar a mudança de status? Esta ação fica no histórico de auditoria.')) return;
    this.mutate(this.finance.transitionOrder(order.id,status,
      status === 'DELIVERED' ? this.orderDeliveryDate : null,reason),
      'Status operacional da encomenda atualizado.');
  }

  receiveOrderPayment(): void {
    const order = this.selectedOrder;
    if (!this.can('SALES_MANAGE') || !order || order.status === 'CANCELLED' ||
        !Number.isFinite(this.orderReceiptAmount) || this.orderReceiptAmount <= 0 ||
        this.orderReceiptAmount > order.totalAmount - order.paidAmount) {
      this.errorMessage = 'Informe recebimento positivo que não ultrapasse o saldo da encomenda.';
      return;
    }
    if (!this.orderReceiptKey) this.orderReceiptKey = crypto.randomUUID();
    this.mutate(this.finance.receiveOrderPayment(order.id,{
      requestKey:this.orderReceiptKey,amount:this.orderReceiptAmount,
      receivedOn:this.orderReceiptDate,paymentMethod:this.orderReceiptMethod,
      externalReference:this.orderReceiptReference.trim() || null,
      notes:this.orderReceiptNotes.trim() || null
    }), 'Recebimento registrado apenas na encomenda (não no caixa).',() => {
      this.orderReceiptKey = '';
      this.orderReceiptAmount = 0;
      this.orderReceiptReference = '';
      this.orderReceiptNotes = '';
    });
  }

  hasOrderPaymentReversal(receiptId: number): boolean {
    return this.orderPayments.some(payment => payment.originalEventId === receiptId);
  }

  reverseOrderPayment(payment: CommerceOrderPayment): void {
    const order = this.selectedOrder;
    const reason = this.orderReversalReason.trim();
    if (!this.can('SALES_MANAGE') || !order || payment.eventKind !== 'RECEIPT' ||
        reason.length < 3 || this.orderPayments.some(p => p.originalEventId === payment.id)) {
      this.errorMessage = 'Informe motivo e selecione recebimento ainda não estornado.';
      return;
    }
    if (!window.confirm('Estornar o recebimento na encomenda sem excluir o histórico?')) return;
    if (!this.orderReversalKey || this.orderReversalTargetId !== payment.id) {
      this.orderReversalKey = crypto.randomUUID();
      this.orderReversalDate = brazilToday();
      this.orderReversalTargetId = payment.id;
    }
    this.mutate(this.finance.reverseOrderPayment(order.id,payment.id,
      this.orderReversalKey,this.orderReversalDate,reason),
      'Estorno de recebimento registrado.',() => {
        this.orderReversalReason = '';
        this.orderReversalKey = '';
        this.orderReversalDate = '';
        this.orderReversalTargetId = null;
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

  startPaymentMetadataEdit(payment: CommercePayment): void {
    if(!this.can('PAYMENTS_RECORD') || !this.can('FINANCE_VIEW')
      || payment.eventKind!=='PAYMENT') return;
    this.editingPaymentMetadataId=payment.id;
    this.paymentMetadataReference=payment.externalReference;
    this.paymentMetadataNotes=payment.notes || '';
    this.paymentMetadataReason='';
  }

  cancelPaymentMetadataEdit(): void {
    this.editingPaymentMetadataId=null;
    this.paymentMetadataReason='';
  }

  submitPaymentMetadataCorrection(): void {
    const statement=this.selectedStatement;
    const id=this.editingPaymentMetadataId;
    if(!this.can('PAYMENTS_RECORD') || !this.can('FINANCE_VIEW') ||
       !statement || id==null || !this.paymentMetadataReference.trim() ||
       this.paymentMetadataReason.trim().length<3) {
      this.errorMessage='Informe a nova referência e o motivo da retificação.';
      return;
    }
    this.mutate(this.finance.correctArtistPaymentMetadata(statement.id,id,
      this.paymentMetadataReference.trim(),this.paymentMetadataNotes.trim() || null,
      this.paymentMetadataReason.trim()),
      'Referência/observação retificada; valor do repasse e histórico preservados.',
      ()=>this.cancelPaymentMetadataEdit());
  }

  togglePaymentMetadataHistory(paymentId:number): void {
    const statement=this.selectedStatement;
    if(!statement || !this.can('FINANCE_VIEW')) return;
    if(this.paymentMetadataHistoryId===paymentId) {
      this.paymentMetadataHistoryId=null;
      this.paymentMetadataHistoryRows=[];
      return;
    }
    this.paymentMetadataHistoryId=paymentId;
    this.paymentMetadataHistoryLoading=true;
    this.finance.artistPaymentMetadataHistory(statement.id,paymentId)
      .pipe(takeUntil(this.destroy$)).subscribe({
        next:rows=>{this.paymentMetadataHistoryRows=rows;this.paymentMetadataHistoryLoading=false;},
        error:()=>{this.paymentMetadataHistoryLoading=false;
          this.errorMessage='Não foi possível consultar o histórico de retificações do repasse.';}
      });
  }

  artistPaymentWasReversed(id: number): boolean {
    return this.payments.some(p=>p.eventKind==='REVERSAL' && p.originalPaymentId===id);
  }

  beginReverseArtistPayment(payment: CommercePayment): void {
    if(this.access?.owner!==true || payment.eventKind!=='PAYMENT' ||
       this.artistPaymentWasReversed(payment.id)) return;
    this.reversingArtistPaymentId=payment.id;
    this.reversingArtistPaymentReason='';
    this.reversingArtistPaymentDate=brazilToday();
  }

  cancelReverseArtistPayment(): void {
    this.reversingArtistPaymentId=null;
    this.reversingArtistPaymentReason='';
  }

  reverseArtistPayment(): void {
    const statement=this.selectedStatement;
    const paymentId=this.reversingArtistPaymentId;
    const reason=this.reversingArtistPaymentReason.trim();
    if(this.access?.owner!==true || !this.can('FINANCE_VIEW') ||
       !statement || paymentId==null || reason.length<3 ||
       !this.reversingArtistPaymentDate) {
      this.errorMessage='Informe o pagamento, a data e o motivo do estorno.';
      return;
    }
    if(!window.confirm('Registrar compensação contábil? Isto NÃO reembolsa o artista no banco. O pagamento original será mantido no histórico.')) {
      return;
    }
    this.mutate(this.finance.reverseArtistPayment(
      statement.id,paymentId,this.reversingArtistPaymentDate,reason
    ),'Estorno contábil registrado. Verifique o saldo do fechamento.',()=>{
      this.cancelReverseArtistPayment();
      this.selectStatement(statement);
    });
  }

  startCashMetadataEdit(movement:CommerceCashMovement): void {
    if(!this.can('CASHFLOW_MANAGE') || !this.can('FINANCE_VIEW')
      || movement.eventKind!=='POSTED') return;
    this.editingCashMetadataId=movement.id;
    this.cashMetadataDescription=movement.description;
    this.cashMetadataReference=movement.externalReference || '';
    this.cashMetadataNotes=movement.notes || '';
    this.cashMetadataReason='';
  }

  cancelCashMetadataEdit(): void {
    this.editingCashMetadataId=null;
    this.cashMetadataReason='';
  }

  submitCashMetadataCorrection(): void {
    const id=this.editingCashMetadataId;
    if(!this.can('CASHFLOW_MANAGE') || !this.can('FINANCE_VIEW') ||
       id==null || !this.cashMetadataDescription.trim() ||
       this.cashMetadataReason.trim().length<3) {
      this.errorMessage='Informe a descrição e o motivo da retificação.';
      return;
    }
    this.mutate(this.finance.correctCashMetadata(id,
      this.cashMetadataDescription.trim(),this.cashMetadataReference.trim() || null,
      this.cashMetadataNotes.trim() || null,this.cashMetadataReason.trim()),
      'Dados administrativos retificados; valor financeiro preservado.',
      ()=>this.cancelCashMetadataEdit());
  }

  toggleCashMetadataHistory(id:number): void {
    if(!this.can('FINANCE_VIEW')) return;
    if(this.cashMetadataHistoryId===id) {
      this.cashMetadataHistoryId=null;
      this.cashMetadataHistoryRows=[];
      return;
    }
    this.cashMetadataHistoryId=id;
    this.cashMetadataHistoryLoading=true;
    this.finance.cashMetadataHistory(id).pipe(takeUntil(this.destroy$)).subscribe({
      next:rows=>{this.cashMetadataHistoryRows=rows;this.cashMetadataHistoryLoading=false;},
      error:()=>{this.cashMetadataHistoryLoading=false;
        this.errorMessage='Não foi possível consultar o histórico de retificações do caixa.';}
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
