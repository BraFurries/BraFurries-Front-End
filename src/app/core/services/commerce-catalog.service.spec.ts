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
    const uploaded = request.request.body.get('file') as File;
    expect(uploaded.name).toBe('contrato.pdf');
    expect(uploaded.size).toBe(file.size);
    expect(uploaded.type).toBe('application/pdf');
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

  it('uses private multipart and authenticated routes for artwork versions', () => {
    const file = new File(['file'], 'original.psd', { type:'application/octet-stream' });
    catalog.uploadArtworkFile(20,'SOURCE','Camadas originais',file).subscribe();
    const upload=http.expectOne(base+'/artworks/20/files');
    expect(upload.request.method).toBe('POST');
    expect(upload.request.body instanceof FormData).toBeTrue();
    expect(upload.request.body.get('kind')).toBe('SOURCE');
    expect(upload.request.body.get('description')).toBe('Camadas originais');
    expect((upload.request.body.get('file') as File).name).toBe('original.psd');
    expect(upload.request.headers.has('Content-Type')).toBeFalse();
    upload.flush({ id: 55 });

    catalog.artworkFiles(20).subscribe();
    const list=http.expectOne(base+'/artworks/20/files');
    expect(list.request.method).toBe('GET');
    list.flush([]);

    catalog.downloadArtworkFile(20,55).subscribe();
    const download=http.expectOne(base+'/artworks/20/files/55/download');
    expect(download.request.responseType).toBe('blob');
    download.flush(new Blob(['file']));

    catalog.archiveArtworkFile(20,55).subscribe();
    const archive=http.expectOne(base+'/artworks/20/files/55/archive');
    expect(archive.request.method).toBe('POST');
    archive.flush(null);
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

  it('prepares a frozen PDF with complete legal parties via authenticated API only', () => {
    catalog.prepareContract(20,{
      templateId:12,effectiveFrom:'2026-11-12',effectiveUntil:null,oneTimeAmount:199.99,
      contractor:{legalName:'Pessoa responsável',document:'12345678900',address:'Rua A',representative:null},
      artist:{legalName:'Artista titular',document:'98765432100',address:'Rua B',representative:null}
    }).subscribe();
    const req=http.expectOne(`${base}/artworks/20/contract-preparations`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body.contractor.legalName).toBe('Pessoa responsável');
    expect(req.request.body.artist.legalName).toBe('Artista titular');
    expect(JSON.stringify(req.request.body)).not.toContain('storage_key');
    req.flush({id:51});
  });

  it('gets prepared PDF privately and uploads a human-reviewed signed copy', () => {
    catalog.contractPreparations(20).subscribe();
    const list=http.expectOne(`${base}/artworks/20/contract-preparations`);
    expect(list.request.method).toBe('GET');
    list.flush([]);

    catalog.downloadPreparation(20,51).subscribe();
    const download=http.expectOne(`${base}/artworks/20/contract-preparations/51/download`);
    expect(download.request.responseType).toBe('blob');
    download.flush(new Blob(['pdf'],{type:'application/pdf'}));

    const signed=new File(['%PDF-1.5\n%%EOF'],'assinatura.pdf',{type:'application/pdf'});
    catalog.uploadSignedPreparation(20,51,signed).subscribe();
    const upload=http.expectOne(`${base}/artworks/20/contract-preparations/51/signed`);
    expect(upload.request.method).toBe('POST');
    expect(upload.request.body instanceof FormData).toBeTrue();
    expect(upload.request.body.get('reviewed')).toBe('true');
    expect((upload.request.body.get('file') as File).name).toBe('assinatura.pdf');
    expect(upload.request.headers.has('Content-Type')).toBeFalse();
    upload.flush({id:8});

    catalog.cancelPreparation(20,52).subscribe();
    const cancelled=http.expectOne(`${base}/artworks/20/contract-preparations/52/cancel`);
    expect(cancelled.request.method).toBe('POST');
    cancelled.flush(null);
  });
});
