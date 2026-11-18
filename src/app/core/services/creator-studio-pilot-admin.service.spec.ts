import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { CreatorStudioPilotAdminService } from './creator-studio-pilot-admin.service';

describe('CreatorStudioPilotAdminService', () => {
  let service: CreatorStudioPilotAdminService;
  let http: HttpTestingController;
  const base = `${environment.apiBaseUrl}/user/me/creator-studio/admin/invitations`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), CreatorStudioPilotAdminService]
    });
    service = TestBed.inject(CreatorStudioPilotAdminService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists only bounded owner-only subscription grants', () => {
    service.list('ACTIVE', 2, 25).subscribe();
    const req = http.expectOne(r => r.url === base);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('status')).toBe('ACTIVE');
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('pageSize')).toBe('25');
    expect(req.request.params.has('communityId')).toBeFalse();
    req.flush({items: [], page: 2, pageSize:25, total:0});
  });

  it('previews a canonical account before any mutation', () => {
    service.candidate(22).subscribe();
    const req = http.expectOne(`${base}/candidate/22`);
    expect(req.request.method).toBe('GET');
    req.flush({userId:22,displayName:'Artista',mergedAccount:false,
      currentAccess:{allowed:false,tier:null,status:'NOT_AUTHORIZED',
        sourceKind:null,expiresAtUtc:null}});
  });

  it('grants lifetime pilot Pro only through the dedicated administrative endpoint', () => {
    service.grantLifetimePro(22).subscribe();
    const req = http.expectOne(`${base}/pilot-pro-lifetime/22`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    req.flush({allowed:true,tier:'PRO',status:'ACTIVE',
      sourceKind:'PILOT',expiresAtUtc:null});
  });

  it('reads a retention hold exclusively by artist and commission IDs', () => {
    service.inspectHold(31, 105).subscribe();
    const req = http.expectOne(
      `${environment.apiBaseUrl}/user/me/creator-studio/admin/retention/holds/31/105`);
    expect(req.request.method).toBe('GET');
    req.flush({artistUserId:31,commissionId:105,category:'DISPUTE',
      reason:'Contestação',active:true});
  });

  it('sends a justified hold with no client notes or community data', () => {
    service.placeHold({artistUserId:31,commissionId:105,
      category:'LEGAL_OBLIGATION',reason:'Retenção necessária'}).subscribe();
    const req = http.expectOne(
      `${environment.apiBaseUrl}/user/me/creator-studio/admin/retention/holds`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({artistUserId:31,commissionId:105,
      category:'LEGAL_OBLIGATION',reason:'Retenção necessária'});
    expect(req.request.body.communityId).toBeUndefined();
    req.flush({...req.request.body,active:true});
  });

  it('releases a specific hold without deleting the commission itself', () => {
    service.releaseHold(31,105).subscribe();
    const req = http.expectOne(
      `${environment.apiBaseUrl}/user/me/creator-studio/admin/retention/holds/31/105`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });

  it('revokes authorization without deleting commissions or issuing an unrelated request', () => {
    service.revoke(22).subscribe();
    const req = http.expectOne(`${base}/22`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });
});
