import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { CommunityCapabilityService } from './community-capability.service';
import { environment } from '../../../environments/environment';

describe('CommunityCapabilityService', () => {
  let service: CommunityCapabilityService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        CommunityCapabilityService,
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    });
    service = TestBed.inject(CommunityCapabilityService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads canonical Community targets for provisioning', () => {
    service.listMembers(7, 1, 100, 'fox').subscribe();
    const members = http.expectOne(
      request => request.url === `${environment.apiBaseUrl}/user/me/communities/7/members`
        && request.params.get('page') === '1'
        && request.params.get('pageSize') === '100'
        && request.params.get('search') === 'fox'
    );
    expect(members.request.method).toBe('GET');
    members.flush({ items: [], pagination: { page: 1, pageSize: 100, totalElements: 0, totalPages: 0 } });

    service.listRoles(7).subscribe();
    const roles = http.expectOne(`${environment.apiBaseUrl}/user/me/communities/7/team/roles`);
    expect(roles.request.method).toBe('GET');
    roles.flush([]);
  });

  it('uses direct member capability endpoints', () => {
    service.grantDirect(7, 11, 'MEMBER_DETAILS_VIEW').subscribe();
    const grant = http.expectOne(
      `${environment.apiBaseUrl}/user/me/communities/7/members/11/capabilities/MEMBER_DETAILS_VIEW`
    );
    expect(grant.request.method).toBe('PUT');
    grant.flush({ userId: 11, capabilities: ['MEMBER_DETAILS_VIEW'] });

    service.revokeDirect(7, 11, 'MEMBER_DETAILS_VIEW').subscribe();
    const revoke = http.expectOne(
      `${environment.apiBaseUrl}/user/me/communities/7/members/11/capabilities/MEMBER_DETAILS_VIEW`
    );
    expect(revoke.request.method).toBe('DELETE');
    revoke.flush({ userId: 11, capabilities: [] });
  });

  it('uses role capability endpoints', () => {
    service.grantRole(7, 22, 'TEAM_MANAGE_STRUCTURE').subscribe();
    const grant = http.expectOne(
      `${environment.apiBaseUrl}/user/me/communities/7/team/roles/22/capabilities/TEAM_MANAGE_STRUCTURE`
    );
    expect(grant.request.method).toBe('PUT');
    grant.flush({ roleId: 22, capabilities: ['TEAM_MANAGE_STRUCTURE'] });

    service.roleGrants(7, 22).subscribe();
    const read = http.expectOne(
      `${environment.apiBaseUrl}/user/me/communities/7/team/roles/22/capabilities`
    );
    expect(read.request.method).toBe('GET');
    read.flush({ roleId: 22, capabilities: ['TEAM_MANAGE_STRUCTURE'] });
  });
});
