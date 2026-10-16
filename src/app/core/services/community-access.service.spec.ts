import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { CommunityAccessService } from './community-access.service';
import { environment } from '../../../environments/environment';

describe('CommunityAccessService', () => {
  let service: CommunityAccessService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        CommunityAccessService,
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    });
    service = TestBed.inject(CommunityAccessService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists visible Communities without calculating cross-Community navigation', () => {
    service.listCommunities().subscribe();

    const request = http.expectOne(`${environment.apiBaseUrl}/user/me/communities`);
    expect(request.request.method).toBe('GET');
    request.flush([]);
  });

  it('loads access for one explicit Community', () => {
    service.getAccess(15).subscribe();

    const request = http.expectOne(`${environment.apiBaseUrl}/user/me/communities/15/access`);
    expect(request.request.method).toBe('GET');
    request.flush({
      communityId: 15,
      owner: false,
      communityAdmin: false,
      activeMember: true,
      canManageCommunityAdmins: false,
      activeRoleIds: [],
      capabilities: [],
      teamScopes: []
    });
  });

  it('requests Community synchronization through the canonical endpoint', () => {
    service.requestSync(15).subscribe();

    const request = http.expectOne(`${environment.apiBaseUrl}/user/me/communities/15/sync`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({});
    request.flush({ runIds: [99], queuedNetworks: 1 });
  });

  it('reads latest Community synchronization state', () => {
    service.getLatestSync(15).subscribe();

    const request = http.expectOne(`${environment.apiBaseUrl}/user/me/communities/15/sync`);
    expect(request.request.method).toBe('GET');
    request.flush({
      runId: 99,
      communityId: 15,
      networkType: 'DISCORD',
      externalNetworkId: '123',
      trigger: 'MANUAL',
      status: 'RUNNING',
      startedAt: '2026-10-02T12:00:00',
      completedAt: null,
      observedMembers: null,
      updatedMembers: null,
      errorCode: null
    });
  });
});
