import { CommonModule } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { RouterTestingModule } from '@angular/router/testing';
import { CommerceNavigationComponent } from './commerce-navigation.component';
import { of, throwError } from 'rxjs';
import { PlatformAccessService } from '../../../core/services/platform-access.service';
import { CommerceFinanceService, CommerceStatement } from '../../../core/services/commerce-finance.service';
import { CommerceFinanceComponent } from './commerce-finance.component';

describe('CommerceFinanceComponent', () => {
  let fixture: ComponentFixture<CommerceFinanceComponent>;
  let component: CommerceFinanceComponent;
  let finance: jasmine.SpyObj<CommerceFinanceService>;
  let access: jasmine.SpyObj<PlatformAccessService>;

  const ORDER_KEY = ['fb74829b','c186','46a9','9fdb','7d683a998884'].join('-');

  const statement: CommerceStatement = {
    id: 3, artistUserId: 12, artistName: 'Artista', periodYear: 2025,
    periodMonth: 12, status: 'APPROVED', totalAmount: 100, paidAmount: 0,
    createdAt: '2026-01-01', approvedAt: '2026-01-02'
  };

  async function init(permissions: string[], owner=false, enabled=true): Promise<void> {
    access=jasmine.createSpyObj<PlatformAccessService>('PlatformAccessService',['myAccess']);
    access.myAccess.and.returnValue(of({ owner, enabled, permissions }));
    finance=jasmine.createSpyObj<CommerceFinanceService>('CommerceFinanceService',[
      'availableBatches','sales','saleItems','createSale','cancelSale',
      'royalties','statements','createStatement','statementItems',
      'approveStatement','discardStatement','payments','recordPayment','reverseArtistPayment',
      'correctArtistPaymentMetadata','artistPaymentMetadataHistory',
      'correctCashMetadata','cashMetadataHistory',
      'cashMovements','cashSummary','createCashMovement','reverseCashMovement',
      'orders','orderProductChoices','createOrder','updateOrder','deleteUnusedOrder','orderItems','transitionOrder','orderPayments',
      'receiveOrderPayment','reverseOrderPayment'
    ]);
    finance.availableBatches.and.returnValue(of([
      {batchId:1,productId:5,productName:'Caneca',sku:'MUG',suggestedPrice:60,availableUnits:10}
    ]));
    finance.sales.and.returnValue(of([]));
    finance.orders.and.returnValue(of([]));
    finance.orderProductChoices.and.returnValue(of([{id:5,name:'Caneca',suggestedPrice:65}]));
    finance.orderItems.and.returnValue(of([]));
    finance.orderPayments.and.returnValue(of([]));
    finance.createOrder.and.returnValue(of({ id: 40 }));
    finance.updateOrder.and.returnValue(of(void 0));
    finance.deleteUnusedOrder.and.returnValue(of(void 0));
    finance.transitionOrder.and.returnValue(of(void 0));
    finance.receiveOrderPayment.and.returnValue(of({ id: 41 }));
    finance.reverseOrderPayment.and.returnValue(of({ id: 42 }));
    finance.saleItems.and.returnValue(of([]));
    finance.royalties.and.returnValue(of([
      { id:9,artistUserId:12,artistName:'Artista',artworkId:4,contractId:8,
        periodYear:2025,periodMonth:12,eventKind:'SALE',royaltyMethod:'PERCENT_GROSS',
        contractRate:10,fixedUnit:null,allocation:100,basisAmount:100,
        amount:10,saleId:2,createdAt:'2025-12-14' }
    ]));
    finance.statements.and.returnValue(of([statement]));
    finance.statementItems.and.returnValue(of([]));
    finance.payments.and.returnValue(of([]));
    finance.createSale.and.returnValue(of({id:18}));
    finance.cancelSale.and.returnValue(of(void 0));
    finance.cashMovements.and.returnValue(of([]));
    finance.cashSummary.and.returnValue(of({
      year:2026,month:11,grossSales:100,processingFees:4.50,netSales:95.50,
      otherIncome:0,operatingExpenses:0,fundingNonRepayable:0,
      fundingRepayable:0,artistPayouts:0,netCashMovement:95.50
    }));
    finance.createCashMovement.and.returnValue(of({id:19}));
    finance.reverseCashMovement.and.returnValue(of({id:20}));
    finance.createStatement.and.returnValue(of({id:6}));
    finance.recordPayment.and.returnValue(of({id:7}));
    finance.reverseArtistPayment.and.returnValue(of({id:100}));
    finance.correctArtistPaymentMetadata.and.returnValue(of(void 0));
    finance.artistPaymentMetadataHistory.and.returnValue(of([]));
    finance.correctCashMetadata.and.returnValue(of(void 0));
    finance.cashMetadataHistory.and.returnValue(of([]));
    finance.approveStatement.and.returnValue(of(void 0));
    finance.discardStatement.and.returnValue(of(void 0));

    await TestBed.configureTestingModule({
      declarations:[CommerceFinanceComponent, CommerceNavigationComponent],
      imports:[CommonModule,FormsModule,RouterTestingModule],
      providers:[
        {provide:PlatformAccessService,useValue:access},
        {provide:CommerceFinanceService,useValue:finance}
      ]
    }).compileComponents();
    fixture=TestBed.createComponent(CommerceFinanceComponent);
    component=fixture.componentInstance;
    fixture.detectChanges();
  }

  afterEach(() => fixture?.destroy());

  it('does not request financial information for nonapproved users', async () => {
    await init([]);
    expect(component.visibleTabs()).toEqual([]);
    expect(finance.sales).not.toHaveBeenCalled();
    expect(finance.royalties).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('não possui autorização');
  });

  it('keeps supplier costs and payment history hidden from a sales-only staff member', async () => {
    await init(['SALES_MANAGE']);
    expect(component.visibleTabs().map(tab => tab.key)).toEqual(['sales','orders']);
    expect(finance.availableBatches).toHaveBeenCalled();
    expect(finance.sales).toHaveBeenCalled();
    expect(finance.royalties).not.toHaveBeenCalled();
    expect(finance.payments).not.toHaveBeenCalled();
    expect(finance.cashMovements).not.toHaveBeenCalled();
  });

  it('finance viewers can see royalties and statements but cannot create sales', async () => {
    await init(['FINANCE_VIEW']);
    expect(component.visibleTabs().map(tab => tab.key)).toEqual(['royalties','statements','cash']);
    expect(finance.availableBatches).not.toHaveBeenCalled();
    expect(finance.royalties).toHaveBeenCalled();
    component.addSaleLine();
    expect(component.saleLines.length).toBe(0);
    expect(finance.createSale).not.toHaveBeenCalled();
  });

  it('does not query operational orders without SALES_MANAGE permission', async () => {
    await init(['FINANCE_VIEW']);
    expect(finance.orders).not.toHaveBeenCalled();
    expect(component.visibleTabs().some(tab => tab.key === 'orders')).toBeFalse();
    component.addOrderLine();
    expect(component.orderDraftLines).toEqual([]);
  });

  it('allows picking a product using only the minimal sales permission', async () => {
    await init(['SALES_MANAGE']);
    component.addOrderLine();
    component.orderDraftLines[0].productId = 5;
    component.onOrderProductSelected(component.orderDraftLines[0]);
    expect(component.orderDraftLines[0].label).toBe('Caneca');
    expect(component.orderDraftLines[0].unitPrice).toBe(65);
    expect(finance.orderProductChoices).toHaveBeenCalled();
  });

  it('creates a custom preorder without creating a financial sale', async () => {
    await init(['SALES_MANAGE']);
    component.orderBuyer = 'Kéti';
    component.orderRequestKey = ORDER_KEY;
    component.orderDate = '2026-11-03';
    component.orderDueDate = '2026-11-20';
    component.addOrderLine();
    component.orderDraftLines[0] = {
      productId: null, label: 'Camiseta', size: 'GG',quantity: 2,unitPrice: 55
    };
    component.createOrder();
    expect(finance.createOrder).toHaveBeenCalledWith(jasmine.objectContaining({
      requestKey:ORDER_KEY,
      buyerLabel:'Kéti',expectedDeliveryOn:'2026-11-20',
      items:[{productId:null,label:'Camiseta',size:'GG',quantity:2,unitPrice:55}]
    }));
    expect(finance.createSale).not.toHaveBeenCalled();
    expect(component.orderRequestKey).toBe('');
  });

  it('retains order idempotency key after a timeout', async () => {
    await init(['SALES_MANAGE']);
    component.orderBuyer = 'Comprador';
    component.orderRequestKey = ORDER_KEY;
    component.orderDate = '2026-11-03';
    component.addOrderLine();
    component.orderDraftLines[0] = {
      productId:null,label:'Poster',size:null,quantity:1,unitPrice:45
    };
    finance.createOrder.and.returnValue(throwError(() => new Error('Timeout')));
    component.createOrder();
    expect(component.orderRequestKey).toBe(ORDER_KEY);
    finance.createOrder.and.returnValue(of({ id: 40 }));
    component.createOrder();
    expect(finance.createOrder).toHaveBeenCalledTimes(2);
    expect(component.orderRequestKey).toBe('');
  });

  it('retries a receipt reversal with the original request key and date', async () => {
    await init(['SALES_MANAGE']);
    spyOn(window,'confirm').and.returnValue(true);
    component.orders = [{
      id:25,buyerLabel:'Guto',channel:'DIRECT',externalReference:null,
      orderedOn:'2026-11-03',expectedDeliveryOn:null,status:'OPEN',
      totalAmount:65,paidAmount:65,notes:null,readyAt:null,
      deliveredOn:null,cancellationReason:null
    }];
    component.selectedOrderId = 25;
    const receipt = {
      id:88,eventKind:'RECEIPT' as const,originalEventId:null,amount:65,
      receivedOn:'2026-11-03',paymentMethod:'PIX',externalReference:null,notes:null
    };
    component.orderPayments=[receipt];
    component.orderReversalReason='Pagamento duplicado';
    finance.reverseOrderPayment.and.returnValue(throwError(() => new Error('Timeout')));
    component.reverseOrderPayment(receipt);
    const first=finance.reverseOrderPayment.calls.mostRecent().args;
    component.reverseOrderPayment(receipt);
    const second=finance.reverseOrderPayment.calls.mostRecent().args;
    expect(second[0]).toBe(25);
    expect(second[1]).toBe(88);
    expect(second[2]).toBe(first[2]);
    expect(second[3]).toBe(first[3]);

    const different={...receipt,id:89};
    component.orderPayments=[receipt,different];
    component.reverseOrderPayment(different);
    const third=finance.reverseOrderPayment.calls.mostRecent().args;
    expect(third[2]).not.toBe(first[2]);
  });

  it('creates a sale with a stable idempotency key and no locally computed royalty', async () => {
    await init(['SALES_MANAGE']);
    component.addSaleLine();
    component.saleRequestKey='e81e8ef8-7950-4a27-a350-9613ee2635c2';
    component.saleReference='BRAF-42';
    component.saleDate='2026-10-30';
    component.createSale();
    expect(finance.createSale).toHaveBeenCalledWith(jasmine.objectContaining({
      requestKey:'e81e8ef8-7950-4a27-a350-9613ee2635c2',
      channel:'DIRECT',externalReference:'BRAF-42',
      items:[{batchId:1,quantity:1,unitPrice:60}]
    }));
    expect(component.saleRequestKey).toBe('');
    expect(component.successMessage).toContain('Venda registrada');
  });

  it('reuses the sale key after a timeout instead of duplicating an order', async () => {
    await init(['SALES_MANAGE']);
    component.addSaleLine();
    component.saleRequestKey='e81e8ef8-7950-4a27-a350-9613ee2635c2';
    finance.createSale.and.returnValue(throwError(() => new Error('Timeout')));
    component.createSale();
    expect(component.saleRequestKey).toBe('e81e8ef8-7950-4a27-a350-9613ee2635c2');
    finance.createSale.and.returnValue(of({id:18}));
    component.createSale();
    expect(finance.createSale.calls.count()).toBe(2);
    expect(component.saleRequestKey).toBe('');
  });

  it('allows only a settlement manager with finance view to prepare a draft', async () => {
    await init(['FINANCE_VIEW']);
    component.statementArtistId=12;
    component.periodYear=2025;
    component.periodMonth=12;
    component.createDraft();
    expect(finance.createStatement).not.toHaveBeenCalled();
    component.access={enabled:true,owner:false,
      permissions:['FINANCE_VIEW','SETTLEMENTS_MANAGE']};
    component.createDraft();
    expect(finance.createStatement).toHaveBeenCalledWith(12,2025,12);
  });

  it('only records external payments with explicit payment and finance privileges', async () => {
    await init(['FINANCE_VIEW','PAYMENTS_RECORD']);
    component.periodYear=2025;
    component.periodMonth=12;
    component.changePeriod();
    component.selectStatement(statement);
    component.paymentRequestKey='d1d2d3d4-1234-4678-8abc-1234567890ab';
    component.paymentAmount=25;
    component.paymentReference='PIX-REFERENCE';
    spyOn(window,'confirm').and.returnValue(true);
    component.recordPayment();
    expect(finance.recordPayment).toHaveBeenCalledWith(3,jasmine.objectContaining({
      requestKey:'d1d2d3d4-1234-4678-8abc-1234567890ab',
      amount:25,externalReference:'PIX-REFERENCE'
    }));
    expect(component.paymentRequestKey).toBe('');
  });

  it('does not expose the administrative grants editor from the finance screen', async () => {
    await init(['FINANCE_VIEW']);
    const header = fixture.nativeElement.querySelector('header') as HTMLElement;
    expect(header.textContent).not.toContain('Equipe e acessos');
    expect(header.textContent).not.toContain('Gerenciar permissões');
    expect(header.querySelector('a[href="/painel/gestao-comercial/catalogo"]')).toBeTruthy();
    expect(header.querySelector('a[href="/painel/gestao-comercial"]')).toBeNull();
  });

  it('owner has all finance operations without a Community Admin grant', async () => {
    await init([],true);
    expect(component.visibleTabs().length).toBe(5);
    expect(finance.royalties).toHaveBeenCalled();
    expect(finance.availableBatches).toHaveBeenCalled();
  });
  it('cashflow posting requires a separate management grant and a finance read grant', async () => {
    await init(['FINANCE_VIEW']);
    component.cashForm.amount = 150;
    component.cashForm.description = 'Compra de material';
    component.cashForm.counterpartyLabel = 'Fornecedor';
    component.createCashMovement();
    expect(finance.createCashMovement).not.toHaveBeenCalled();

    component.access={enabled:true,owner:false,
      permissions:['FINANCE_VIEW','CASHFLOW_MANAGE']};
    component.cashRequestKey=crypto.randomUUID();
    component.createCashMovement();
    expect(finance.createCashMovement).toHaveBeenCalledWith(jasmine.objectContaining({
      movementType:'EXPENSE',amount:150,contributorType:null,contributionNature:null
    }));
  });

  it('reports staff contributions as funding with refundable status, not sales', async () => {
    await init(['FINANCE_VIEW','CASHFLOW_MANAGE']);
    component.cashForm = {
      ...component.cashForm,movementType:'CONTRIBUTION',
      amount:80,description:'Aporte do time',counterpartyLabel:'Staff',
      contributorType:'STAFF',contributionNature:'REPAYABLE'
    };
    component.cashRequestKey=crypto.randomUUID();
    component.createCashMovement();
    expect(finance.createCashMovement).toHaveBeenCalledWith(jasmine.objectContaining({
      movementType:'CONTRIBUTION',contributorType:'STAFF',
      contributionNature:'REPAYABLE',amount:80
    }));
  });

  it('records maquininha fees with the sale and does not create a second expense', async () => {
    await init(['SALES_MANAGE']);
    component.addSaleLine();
    component.saleRequestKey=crypto.randomUUID();
    component.salePaymentMethod='CARD_CREDIT';
    component.saleProcessingProvider='Maquininha';
    component.saleProcessingFeePercent=3.5;
    component.saleProcessingFeeFixed=1;
    component.createSale();
    expect(finance.createSale).toHaveBeenCalledWith(jasmine.objectContaining({
      paymentMethod:'CARD_CREDIT',processingProvider:'Maquininha',
      processingFeePercent:3.5,processingFeeFixed:1
    }));
    expect(finance.createCashMovement).not.toHaveBeenCalled();
  });

  it('does not allow sales managers to reverse cash movements without cashflow grant', async () => {
    await init(['SALES_MANAGE']);
    component.cashReversalId=4;
    component.cashReversalReason='Registro incorreto';
    component.reverseCashMovement();
    expect(finance.reverseCashMovement).not.toHaveBeenCalled();
  });

  it('restricts artist payment reversal to platform owner and requires a reason', async () => {
    await init(['FINANCE_VIEW','PAYMENTS_RECORD'],false);
    component.statements=[statement];
    component.selectedStatementId=3;
    component.payments=[{
      id:99,amount:50,paidOn:'2026-11-02',externalReference:'PIX',
      notes:null,createdAt:'2026-11-02',eventKind:'PAYMENT',
      originalPaymentId:null,reversalReason:null,reversedAt:null
    }];
    component.beginReverseArtistPayment(component.payments[0]);
    expect(component.reversingArtistPaymentId).toBeNull();
    expect(finance.reverseArtistPayment).not.toHaveBeenCalled();

    component.access={enabled:true,owner:true,permissions:[]};
    component.beginReverseArtistPayment(component.payments[0]);
    expect(component.reversingArtistPaymentId).toBe(99);
    component.reversingArtistPaymentReason='Registro duplicado';
    component.reversingArtistPaymentDate='2026-11-09';
    spyOn(window,'confirm').and.returnValue(true);
    component.reverseArtistPayment();
    expect(finance.reverseArtistPayment).toHaveBeenCalledWith(
      3,99,'2026-11-09','Registro duplicado');
  });

  it('does not permit reversal of an already offset payout', async () => {
    await init([],true);
    component.payments=[{
      id:99,amount:50,paidOn:'2026-11-02',externalReference:'PIX',
      notes:null,createdAt:'2026-11-02',eventKind:'PAYMENT',
      originalPaymentId:null,reversalReason:null,reversedAt:null
    },{
      id:100,amount:-50,paidOn:'2026-11-09',externalReference:'REV',
      notes:null,createdAt:'2026-11-09',eventKind:'REVERSAL',
      originalPaymentId:99,reversalReason:'Duplicado',reversedAt:'2026-11-09'
    }];
    component.beginReverseArtistPayment(component.payments[0]);
    expect(component.reversingArtistPaymentId).toBeNull();
    expect(finance.reverseArtistPayment).not.toHaveBeenCalled();
  });

  it('edits only unpaid open orders, without touching recorded payments', async () => {
    await init(['SALES_MANAGE']);
    const order = {
      id:25,buyerLabel:'Kéti',channel:'DIRECT',externalReference:null,
      orderedOn:'2026-11-03',expectedDeliveryOn:null,status:'OPEN' as const,
      totalAmount:100,paidAmount:0,notes:null,readyAt:null,
      deliveredOn:null,cancellationReason:null
    };
    finance.orderItems.and.returnValue(of([{
      id:1,productId:null,label:'Camiseta',size:'GG',quantity:2,
      unitPrice:50,lineAmount:100
    }]));
    finance.orderPayments.and.returnValue(of([]));
    component.editOpenOrder(order);
    expect(component.editingOrderId).toBe(25);
    component.orderNotes='Ajuste do tamanho';
    component.createOrder();
    expect(finance.updateOrder).toHaveBeenCalledWith(25,jasmine.objectContaining({
      buyerLabel:'Kéti',notes:'Ajuste do tamanho',
      items:[{productId:null,label:'Camiseta',size:'GG',quantity:2,unitPrice:50}]
    }));
    expect(finance.createOrder).not.toHaveBeenCalled();
    expect(component.editingOrderId).toBeNull();
  });

  it('disallows editing zero-balance orders that have receipt history', async () => {
    await init(['SALES_MANAGE']);
    const order = {
      id:25,buyerLabel:'Kéti',channel:'DIRECT',externalReference:null,
      orderedOn:'2026-11-03',expectedDeliveryOn:null,status:'OPEN' as const,
      totalAmount:100,paidAmount:0,notes:null,readyAt:null,
      deliveredOn:null,cancellationReason:null
    };
    finance.orderPayments.and.returnValue(of([{
      id:88,eventKind:'RECEIPT' as const,originalEventId:null,amount:50,
      receivedOn:'2026-11-03',paymentMethod:'PIX',externalReference:null,notes:null
    }]));
    component.editOpenOrder(order);
    expect(component.editingOrderId).toBeNull();
    expect(finance.updateOrder).not.toHaveBeenCalled();
  });

  it('allows finance staff to correct payment metadata without changing amounts', async () => {
    await init(['FINANCE_VIEW','PAYMENTS_RECORD']);
    component.selectedStatementId=3;
    const payment={
      id:99,amount:50,paidOn:'2026-11-02',externalReference:'PIX-1',
      notes:null,createdAt:'2026-11-02',eventKind:'PAYMENT' as const,
      originalPaymentId:null,reversalReason:null,reversedAt:null
    };
    component.startPaymentMetadataEdit(payment);
    component.paymentMetadataReference='PIX-2';
    component.paymentMetadataNotes='Referência confirmada';
    component.paymentMetadataReason='Código do PIX digitado errado';
    component.submitPaymentMetadataCorrection();
    expect(finance.correctArtistPaymentMetadata).toHaveBeenCalledWith(
      3,99,'PIX-2','Referência confirmada','Código do PIX digitado errado');
    expect(finance.recordPayment).not.toHaveBeenCalled();
    expect(finance.reverseArtistPayment).not.toHaveBeenCalled();
  });

  it('does not allow nonfinance staff to correct cash metadata', async () => {
    await init(['SALES_MANAGE']);
    component.editingCashMetadataId=25;
    component.cashMetadataDescription='Despesa';
    component.cashMetadataReason='Descrição errada';
    component.submitCashMetadataCorrection();
    expect(finance.correctCashMetadata).not.toHaveBeenCalled();
  });

  it('records cash metadata correction using separate append-only route', async () => {
    await init(['FINANCE_VIEW','CASHFLOW_MANAGE']);
    component.editingCashMetadataId=25;
    component.cashMetadataDescription='Impressão de cartazes';
    component.cashMetadataReference='NF-42';
    component.cashMetadataNotes='';
    component.cashMetadataReason='Nota fiscal revisada';
    component.submitCashMetadataCorrection();
    expect(finance.correctCashMetadata).toHaveBeenCalledWith(
      25,'Impressão de cartazes','NF-42',null,'Nota fiscal revisada');
    expect(finance.createCashMovement).not.toHaveBeenCalled();
  });

  it('allows finance viewers to inspect past payout corrections', async () => {
    await init(['FINANCE_VIEW']);
    component.selectedStatementId=3;
    finance.artistPaymentMetadataHistory.and.returnValue(of([{
      id:7,previousReference:'PIX-A',updatedReference:'PIX-B',
      previousNotes:null,updatedNotes:'Revisado',reason:'Digitação',
      actorUserId:2,createdAt:'2026-11-09T10:00:00'
    }]));
    component.togglePaymentMetadataHistory(99);
    expect(finance.artistPaymentMetadataHistory).toHaveBeenCalledWith(3,99);
    expect(component.paymentMetadataHistoryRows[0].updatedReference).toBe('PIX-B');
    expect(finance.correctArtistPaymentMetadata).not.toHaveBeenCalled();
  });

  it('uses the same stable commercial navigation labels and URL base', async () => {
    await init(['SALES_MANAGE']);
    const nav = fixture.nativeElement.querySelector('nav[aria-label="Áreas da Gestão Comercial"]') as HTMLElement;
    const links = Array.from(nav.querySelectorAll('a')) as HTMLAnchorElement[];
    expect(links.map(link => link.textContent?.trim())).toEqual(['Financeiro', 'Cadastros']);
    expect(links.map(link => new URL(link.href).pathname)).toEqual([
      '/painel/gestao-comercial/financeiro', '/painel/gestao-comercial/catalogo'
    ]);
    expect(links[0].getAttribute('aria-current')).toBe('page');
  });

  it('separates the sales form from its listing and goes back after saving', async () => {
    await init(['SALES_MANAGE']);
    expect(fixture.nativeElement.textContent).toContain('Histórico de vendas');
    component.openForm('sale');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Registrar venda física');
    expect(fixture.nativeElement.textContent).not.toContain('Histórico de vendas');
    component.saleLines = [{batchId:1, quantity:1, unitPrice:60}];
    component.createSale();
    expect(finance.createSale).toHaveBeenCalled();
    expect(component.screen).toBe('browse');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Histórico de vendas');
  });

  it('uses an exclusive form for cash records and respects cashflow grants', async () => {
    await init(['FINANCE_VIEW']);
    component.selectTab('cash');
    component.openForm('cash');
    expect(component.screen).toBe('browse');
    component.access = {enabled:true,owner:false,permissions:['FINANCE_VIEW','CASHFLOW_MANAGE']};
    component.openForm('cash');
    fixture.detectChanges();
    expect(component.screen).toBe('form');
    expect(fixture.nativeElement.textContent).toContain('Nova entrada, saída ou aporte');
    expect(fixture.nativeElement.textContent).not.toContain('Entradas, saídas e aportes registrados');
    component.backToList();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Entradas, saídas e aportes registrados');
  });

  it('opens monthly closing and artist payout forms without displaying the statement list', async () => {
    await init(['FINANCE_VIEW','SETTLEMENTS_MANAGE','PAYMENTS_RECORD']);
    component.selectTab('statements');
    component.openForm('statement');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Gerar rascunho');
    expect(fixture.nativeElement.textContent).not.toContain('Fechamentos mensais');
    component.backToList();
    component.selectStatement(statement);
    component.openForm('payment');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Registrar pagamento externo');
    expect(fixture.nativeElement.textContent).not.toContain('Pagamentos registrados');
  });

  it('preserves draft order data while separating corrections and order receipts', async () => {
    await init(['SALES_MANAGE']);
    component.selectTab('orders');
    component.openForm('order');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Cadastrar encomenda');
    expect(fixture.nativeElement.textContent).not.toContain('Acompanhar encomendas');
    component.backToList();
    expect(component.editingOrderId).toBeNull();
    component.openForm('order-receipt');
    expect(component.screen).toBe('browse');
  });

  it('requires the correct grants to open payout and cash correction screens', async () => {
    await init(['FINANCE_VIEW']);
    component.selectTab('statements');
    component.selectStatement(statement);
    component.openForm('payment');
    expect(component.screen).toBe('browse');
    component.selectTab('cash');
    component.openForm('cash-metadata');
    expect(component.screen).toBe('browse');
  });
});
