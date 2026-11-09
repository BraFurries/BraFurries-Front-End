import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { CommerceFinanceService } from './commerce-finance.service';

describe('CommerceFinanceService', () => {
  let service: CommerceFinanceService;
  let http: HttpTestingController;
  const base = `${environment.apiBaseUrl}/user/me/brafurries-commerce/finance`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers:[provideHttpClient(),provideHttpClientTesting(),CommerceFinanceService]
    });
    service=TestBed.inject(CommerceFinanceService);
    http=TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('loads sellable batch choices without Community-scoped URLs', () => {
    service.availableBatches().subscribe();
    const request=http.expectOne(`${base}/sales/available-batches`);
    expect(request.request.method).toBe('GET');
    request.flush([]);
  });

  it('posts a sale with an idempotency UUID and exact line snapshots requested', () => {
    service.createSale({
      requestKey:'e81e8ef8-7950-4a27-a350-9613ee2635c2',
      channel:'EVENT',externalReference:'EVENT-42',
      buyerLabel:'Comprador',soldOn:'2026-11-03',notes:null,
      items:[{batchId:12,quantity:2,unitPrice:60.00}]
    }).subscribe();
    const request=http.expectOne(`${base}/sales`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body.items).toEqual([
      {batchId:12,quantity:2,unitPrice:60}
    ]);
    expect(request.request.body.requestKey).toBe('e81e8ef8-7950-4a27-a350-9613ee2635c2');
    request.flush({id:31});
  });

  it('reads monthly royalties without exposing contracts object keys', () => {
    service.royalties(2026,10).subscribe();
    const request=http.expectOne(req=>req.url===`${base}/royalties`);
    expect(request.request.params.get('year')).toBe('2026');
    expect(request.request.params.get('month')).toBe('10');
    request.flush([]);
  });

  it('uses separate protected routes for statement approval and payment entry', () => {
    service.createStatement(13,2026,10).subscribe();
    const draft=http.expectOne(`${base}/statements`);
    expect(draft.request.method).toBe('POST');
    expect(draft.request.body).toEqual({artistUserId:13,year:2026,month:10});
    draft.flush({id:21});

    service.approveStatement(21).subscribe();
    const approval=http.expectOne(`${base}/statements/21/approve`);
    expect(approval.request.method).toBe('POST');
    approval.flush(null);

    service.recordPayment(21,{
      requestKey:'d1d2d3d4-1234-4678-8abc-1234567890ab',
      amount:50,paidOn:'2026-11-03',
      externalReference:'PIX-21',notes:null
    }).subscribe();
    const pay=http.expectOne(`${base}/statements/21/payments`);
    expect(pay.request.method).toBe('POST');
    expect(pay.request.body.externalReference).toBe('PIX-21');
    expect(pay.request.body.amount).toBe(50);
    pay.flush({id:99});
  });

  it('sends processing details inside the sale without a second expense posting', () => {
    service.createSale({
      requestKey:crypto.randomUUID(),channel:'EVENT',
      externalReference:null,buyerLabel:null,soldOn:'2026-11-03',
      notes:null,items:[{batchId:1,quantity:2,unitPrice:50}],
      paymentMethod:'CARD_CREDIT',processingProvider:'Maquininha',
      processingFeePercent:3.5,processingFeeFixed:1.00
    }).subscribe();
    const request=http.expectOne(`${base}/sales`);
    expect(request.request.body.paymentMethod).toBe('CARD_CREDIT');
    expect(request.request.body.processingFeePercent).toBe(3.5);
    expect(request.request.body.processingFeeFixed).toBe(1);
    request.flush({id:7});
  });

  it('posts funding as a separate cash entry and reads the monthly summary', () => {
    service.createCashMovement({
      requestKey:crypto.randomUUID(),movementType:'CONTRIBUTION',
      amount:80,occurredOn:'2026-11-03',category:'APORTE',
      description:'Aporte da staff',counterpartyLabel:'Staff',
      counterpartyUserId:null,contributorType:'STAFF',contributionNature:'REPAYABLE',
      paymentMethod:'PIX',externalReference:null,notes:null
    }).subscribe();
    const post=http.expectOne(`${base}/cash-movements`);
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual(jasmine.objectContaining({
      movementType:'CONTRIBUTION',contributionNature:'REPAYABLE',amount:80
    }));
    post.flush({id:21});

    service.cashSummary(2026,11).subscribe();
    const get=http.expectOne(req=>req.url===`${base}/cash-movements/summary`);
    expect(get.request.params.get('year')).toBe('2026');
    expect(get.request.params.get('month')).toBe('11');
    get.flush({year:2026,month:11,netCashMovement:80});
  });

  it('uses an explicit compensating reversal endpoint for incorrect cash entries', () => {
    service.reverseCashMovement(21,'Cadastro duplicado').subscribe();
    const request=http.expectOne(`${base}/cash-movements/21/reverse`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({reason:'Cadastro duplicado'});
    request.flush({id:22});
  });

  it('uses separate BraFurries preorder endpoints and does not post financial sale', () => {
    const baseOrders = environment.apiBaseUrl + '/user/me/brafurries-commerce/orders';
    service.createOrder({
      requestKey:crypto.randomUUID(),
      buyerLabel:'Kéti',channel:'DIRECT',
      externalReference:null,orderedOn:'2026-11-03',
      expectedDeliveryOn:'2026-11-20',notes:null,
      items:[{ productId:null,label:'Camiseta',size:'GG',quantity:2,unitPrice:55 }]
    }).subscribe();
    const create=http.expectOne(baseOrders);
    expect(create.request.method).toBe('POST');
    expect(create.request.body.items[0].size).toBe('GG');
    create.flush({id:40});

    service.orderProductChoices().subscribe();
    const choices=http.expectOne(baseOrders+'/product-choices');
    expect(choices.request.method).toBe('GET');
    choices.flush([{id:5,name:'Caneca',suggestedPrice:65}]);

    service.orders().subscribe();
    const list=http.expectOne(baseOrders);
    expect(list.request.method).toBe('GET');
    list.flush([]);

    service.transitionOrder(40,'READY',null,null).subscribe();
    const status=http.expectOne(baseOrders+'/40/status');
    expect(status.request.body.status).toBe('READY');
    status.flush(null);

    service.receiveOrderPayment(40,{
      requestKey:crypto.randomUUID(),
      amount:50,receivedOn:'2026-11-03',paymentMethod:'PIX',
      externalReference:null,notes:null
    }).subscribe();
    const receipt=http.expectOne(baseOrders+'/40/payments');
    expect(receipt.request.body.amount).toBe(50);
    receipt.flush({id:41});

    service.reverseOrderPayment(40,41,
      crypto.randomUUID(),'2026-11-04','Duplicado').subscribe();
    const reversal=http.expectOne(baseOrders+'/40/payments/41/reverse');
    expect(reversal.request.method).toBe('POST');
    expect(reversal.request.body.reason).toBe('Duplicado');
    reversal.flush({id:42});
  });

  it('posts a dedicated owner-only compensation with reason and date', () => {
    service.reverseArtistPayment(21,99,'2026-11-09','Repasse cadastrado duas vezes').subscribe();
    const request=http.expectOne(`${base}/statements/21/payments/99/reverse`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      reversedOn:'2026-11-09',reason:'Repasse cadastrado duas vezes'
    });
    request.flush({id:100});
  });

  it('cancels an existing sale only through the explicit compensation endpoint', () => {
    service.cancelSale(31,'Cliente desistiu').subscribe();
    const request=http.expectOne(`${base}/sales/31/cancel`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({reason:'Cliente desistiu'});
    request.flush(null);
  });
});
