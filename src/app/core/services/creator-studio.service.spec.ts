import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { CreatorStudioService } from './creator-studio.service';

describe('CreatorStudioService', () => {
  let studio: CreatorStudioService;
  let http: HttpTestingController;
  const base = `${environment.apiBaseUrl}/user/me/creator-studio`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), CreatorStudioService]
    });
    studio = TestBed.inject(CreatorStudioService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('asks the API for the entitlement of the authenticated account, never an artist ID', () => {
    studio.myAccess().subscribe();
    const req = http.expectOne(`${base}/access`);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.keys().length).toBe(0);
    req.flush({ allowed: false, tier: null, status: 'NOT_AUTHORIZED',
      sourceKind: null, expiresAtUtc: null });
  });

  it('fetches only the active commission queue by default', () => {
    studio.commissions(null).subscribe();
    const req = http.expectOne(r => r.url === `${base}/commissions`);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('page')).toBe('1');
    expect(req.request.params.get('pageSize')).toBe('25');
    expect(req.request.params.has('status')).toBeFalse();
    expect(req.request.params.has('userId')).toBeFalse();
    expect(req.request.params.has('communityId')).toBeFalse();
    req.flush({ items: [], page: 1, pageSize: 25, total: 0 });
  });

  it('queries completed history only on explicit status filter', () => {
    studio.commissions('COMPLETED', 2, 10).subscribe();
    const req = http.expectOne(r => r.url === `${base}/commissions`);
    expect(req.request.params.get('status')).toBe('COMPLETED');
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('pageSize')).toBe('10');
    req.flush({ items: [], page: 2, pageSize: 10, total: 0 });
  });

  it('creates a commission without any owner or subscription fields', () => {
    const input = {
      title: 'Ref Sheet', clientName: 'Luna', description: 'Pelo cinza',
      privateNotes: null, requestedOn: '2026-11-12', dueOn: null, artTypeId: null
    };
    studio.create(input).subscribe();
    const req = http.expectOne(`${base}/commissions`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(input);
    expect(req.request.body.ownerUserId).toBeUndefined();
    expect(req.request.body.tier).toBeUndefined();
    req.flush({ ...input, id: 10, status: 'QUEUED', createdAtUtc: '2026-11-17T20:00:00',
      updatedAtUtc: '2026-11-17T20:00:00', completedAtUtc: null });
  });

  it('uses an isolated status endpoint rather than duplicating a card', () => {
    studio.changeStatus(10, 'COMPLETED').subscribe();
    const req = http.expectOne(`${base}/commissions/10/status`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ status: 'COMPLETED' });
    req.flush({ id: 10, status: 'COMPLETED' });
  });
});
