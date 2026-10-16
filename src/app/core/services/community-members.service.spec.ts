import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { CommunityMembersService } from './community-members.service';

describe('CommunityMembersService', () => {
  let service: CommunityMembersService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [CommunityMembersService, provideHttpClient(), provideHttpClientTesting()]
    });
    service = TestBed.inject(CommunityMembersService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists members through the managed-guild Community endpoint', () => {
    service.list('123', 2, 25, '  fox  ').subscribe();

    const request = http.expectOne(candidate =>
      candidate.url === `${environment.apiBaseUrl}/user/me/guilds/123/members`
    );
    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('page')).toBe('2');
    expect(request.request.params.get('pageSize')).toBe('25');
    expect(request.request.params.get('search')).toBe('fox');
    request.flush({ items: [], pagination: { page: 2, pageSize: 25, totalElements: 0, totalPages: 0 } });
  });

  it('omits a blank search and preserves the encoded guildId boundary', () => {
    service.list('123', 1, 20, '   ').subscribe();

    const request = http.expectOne(`${environment.apiBaseUrl}/user/me/guilds/123/members?page=1&pageSize=20`);
    expect(request.request.params.has('search')).toBeFalse();
    request.flush({ items: [], pagination: { page: 1, pageSize: 20, totalElements: 0, totalPages: 0 } });
  });

  it('loads member detail by internal userId', () => {
    service.get('123', 7).subscribe();

    const request = http.expectOne(`${environment.apiBaseUrl}/user/me/guilds/123/members/7`);
    expect(request.request.method).toBe('GET');
    expect(request.request.urlWithParams).not.toContain('/admin/');
    request.flush({
      userId: 7,
      displayName: 'Fox',
      username: 'fox',
      profileImageUrl: null,
      membershipDataState: 'AVAILABLE',
      membershipRecordCount: 1,
      memberSince: null,
      status: 'active',
      approved: true,
      banned: false,
      present: true,
      vip: false,
      partner: false
    });
  });
  it('lists Community member summaries through the canonical communityId endpoint', () => {
    service.listCommunity(9, 2, 25, '  fox  ').subscribe();

    const request = http.expectOne(candidate =>
      candidate.url === `${environment.apiBaseUrl}/user/me/communities/9/members`
    );
    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('page')).toBe('2');
    expect(request.request.params.get('pageSize')).toBe('25');
    expect(request.request.params.get('search')).toBe('fox');
    request.flush({
      items: [],
      pagination: { page: 2, pageSize: 25, totalElements: 0, totalPages: 0 }
    });
  });

  it('loads canonical Community member detail by internal userId', () => {
    service.getCommunityDetail(9, 7).subscribe();

    const request = http.expectOne(
      `${environment.apiBaseUrl}/user/me/communities/9/members/7`
    );
    expect(request.request.method).toBe('GET');
    request.flush({
      userId: 7,
      displayName: 'Fox',
      username: 'fox',
      profileImageUrl: null,
      membershipDataState: 'AVAILABLE',
      membershipRecordCount: 1,
      memberSince: '2026-01-01T00:00:00',
      lastJoinDate: '2026-09-30T20:00:00',
      status: 'active',
      approved: true,
      approvedAt: '2026-01-02T00:00:00',
      banned: false,
      present: true,
      leftAt: null,
      vip: false,
      partner: false,
      roleIds: [2, 3]
    });
  });

});
