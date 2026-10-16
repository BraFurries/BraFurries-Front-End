import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { CommunityTeamAssignmentsService } from './community-team-assignments.service';

describe('CommunityTeamAssignmentsService', () => {
  let service: CommunityTeamAssignmentsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [CommunityTeamAssignmentsService, provideHttpClient(), provideHttpClientTesting()]
    });
    service = TestBed.inject(CommunityTeamAssignmentsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists members for one role inside the managed Community', () => {
    service.listMembers('12/3', 7).subscribe();

    const request = http.expectOne(
      `${environment.apiBaseUrl}/user/me/guilds/12%2F3/team/roles/7/members`
    );
    expect(request.request.method).toBe('GET');
    request.flush([]);
  });

  it('assigns by internal userId with an idempotent PUT', () => {
    service.assign('123', 7, 42).subscribe();

    const request = http.expectOne(
      `${environment.apiBaseUrl}/user/me/guilds/123/team/roles/7/members/42`
    );
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({});
    request.flush({ roleId: 7, userId: 42, createdAt: null });
  });

  it('removes a role assignment explicitly', () => {
    service.remove('123', 7, 42).subscribe();

    const request = http.expectOne(
      `${environment.apiBaseUrl}/user/me/guilds/123/team/roles/7/members/42`
    );
    expect(request.request.method).toBe('DELETE');
    request.flush(null);
  });

  it('lists roles for an internal member', () => {
    service.listRoles('123', 42).subscribe();

    const request = http.expectOne(
      `${environment.apiBaseUrl}/user/me/guilds/123/team/members/42/roles`
    );
    expect(request.request.method).toBe('GET');
    request.flush([]);
  });
  it('uses canonical Community-scoped member endpoints without guild ids', () => {
    service.listMembersCommunity(9, 7).subscribe();
    const members = http.expectOne(
      `${environment.apiBaseUrl}/user/me/communities/9/team/roles/7/members`
    );
    expect(members.request.method).toBe('GET');
    members.flush([]);

    service.listMemberCandidatesCommunity(9, 7, 1, 100, 'fox').subscribe();
    const candidates = http.expectOne(request =>
      request.url === `${environment.apiBaseUrl}/user/me/communities/9/team/roles/7/member-candidates`
      && request.params.get('page') === '1'
      && request.params.get('pageSize') === '100'
      && request.params.get('search') === 'fox'
    );
    expect(candidates.request.method).toBe('GET');
    candidates.flush({
      items: [],
      pagination: { page: 1, pageSize: 100, totalElements: 0, totalPages: 0 }
    });
  });

  it('mutates canonical Community assignments by internal ids', () => {
    service.assignCommunity(9, 7, 42).subscribe();
    const assign = http.expectOne(
      `${environment.apiBaseUrl}/user/me/communities/9/team/roles/7/members/42`
    );
    expect(assign.request.method).toBe('PUT');
    assign.flush({ roleId: 7, userId: 42, createdAt: null });

    service.removeCommunity(9, 7, 42).subscribe();
    const remove = http.expectOne(
      `${environment.apiBaseUrl}/user/me/communities/9/team/roles/7/members/42`
    );
    expect(remove.request.method).toBe('DELETE');
    remove.flush(null);
  });

});
