import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AdminStorageService } from './admin-storage.service';

describe('AdminStorageService', () => {
  let service: AdminStorageService;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    service = TestBed.inject(AdminStorageService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('lists only requested bucket and prefix with bounded pagination cursor', () => {
    service.list('PRIVATE','commerce/contracts/','opaque',50).subscribe();
    const req = http.expectOne(request =>
      request.url.endsWith('/user/me/administration/storage/objects'));
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('bucket')).toBe('PRIVATE');
    expect(req.request.params.get('prefix')).toBe('commerce/contracts/');
    expect(req.request.params.get('cursor')).toBe('opaque');
    expect(req.request.params.get('limit')).toBe('50');
    req.flush({ bucket:'PRIVATE', prefix:'commerce/contracts/', objects:[],
      nextCursor:null, truncated:false, pageBytes:0 });
  });

  it('inspects by exact key without accessing the raw R2 credentials', () => {
    const key='commerce/contracts/12/12345678-1234-1234-1234-123456789abc.pdf';
    service.inspect('PRIVATE',key).subscribe();
    const req=http.expectOne(request => request.url.endsWith('/objects/inspect'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({bucket:'PRIVATE',key});
    expect(req.request.params.keys()).toEqual([]);
    req.flush({ key, sizeBytes:12, lastModified:null, contentType:'application/pdf',
      etag:'"hash"', category:'CONTRACT_DOCUMENT', referenceStatus:'ORPHAN',
      referenceLabel:'Contrato', deletable:true });
  });

  it('requests deletion of only the selected orphan and ETag through the API', () => {
    const key='commerce/artworks/14/12345678-1234-1234-1234-123456789abc.psd';
    service.deleteOrphan('PRIVATE',key,'"same-etag"').subscribe();
    const req=http.expectOne(request => request.url.endsWith('/objects/delete-orphan'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({bucket:'PRIVATE',key,etag:'"same-etag"'});
    req.flush(null);
  });
});
