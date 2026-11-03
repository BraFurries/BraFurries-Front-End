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

  it('cancels an existing sale only through the explicit compensation endpoint', () => {
    service.cancelSale(31,'Cliente desistiu').subscribe();
    const request=http.expectOne(`${base}/sales/31/cancel`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({reason:'Cliente desistiu'});
    request.flush(null);
  });
});
