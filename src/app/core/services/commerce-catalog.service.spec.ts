import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { CommerceCatalogService } from './commerce-catalog.service';

describe('CommerceCatalogService', () => {
  let catalog: CommerceCatalogService;
  let http: HttpTestingController;
  const base = `${environment.apiBaseUrl}/user/me/brafurries-commerce/catalog`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), CommerceCatalogService]
    });
    catalog = TestBed.inject(CommerceCatalogService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('posts artwork with artist account and exact BRL creation cost', () => {
    catalog.createArtwork({ title:'Arte A',description:null,artistUserId:12,creationCost:150.25 })
      .subscribe();
    const request = http.expectOne(`${base}/artworks`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body.artistUserId).toBe(12);
    expect(request.request.body.creationCost).toBe(150.25);
    request.flush({ id: 1 });
  });

  it('sends signed contracts as multipart PDFs without exposing public object keys', () => {
    const file = new File(['%PDF-1.7\n%%EOF'], 'contrato.pdf', { type:'application/pdf' });
    catalog.signContract(20,{
      templateId:12, effectiveFrom:'2026-11-03',
      effectiveUntil:null, oneTimeAmount:199.99, file
    }).subscribe();
    const request=http.expectOne(`${base}/artworks/20/contracts`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body instanceof FormData).toBeTrue();
    expect(request.request.body.get('templateId')).toBe('12');
    expect(request.request.body.get('oneTimeAmount')).toBe('199.99');
    expect(request.request.body.get('file')).toBe(file);
    expect(request.request.headers.has('Content-Type')).toBeFalse();
    request.flush({ id: 4 });
  });

  it('downloads private contracts as blobs using only authenticated API URLs', () => {
    catalog.downloadContract(20,4).subscribe();
    const request=http.expectOne(`${base}/artworks/20/contracts/4/download`);
    expect(request.request.method).toBe('GET');
    expect(request.request.responseType).toBe('blob');
    request.flush(new Blob(['pdf'],{type:'application/pdf'}));
  });

  it('preserves an explicit royalty allocation when connecting artwork to product', () => {
    catalog.linkArtwork(9,20,25.125).subscribe();
    const request=http.expectOne(`${base}/products/9/artworks/20`);
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ royaltyAllocationPercent:25.125 });
    request.flush(null);
  });

  it('sends the batch product supplier cost and quantity to API', () => {
    catalog.createProductionBatch({
      productId:1,supplierId:2,quantity:100,unitCost:12.50,
      additionalCost:35,producedOn:'2026-11-03',reference:'Lote A'
    }).subscribe();
    const request=http.expectOne(`${base}/production-batches`);
    expect(request.request.body).toEqual(jasmine.objectContaining({
      productId:1,supplierId:2,quantity:100,unitCost:12.5,additionalCost:35
    }));
    request.flush({ id:7 });
  });
});
