import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../environments/environment';
import { CommunityActivityService } from './community-activity.service';

describe('CommunityActivityService', () => {
  let service: CommunityActivityService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        CommunityActivityService,
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    });
    service = TestBed.inject(CommunityActivityService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('sends only the sanitized activity filters supported by the API', () => {
    service.list(10, {
      category: 'ACCESS',
      actorUserId: 7,
      from: '2026-10-01T00:00:00',
      to: '2026-10-04T23:59:59.999999',
      cursor: 'opaque',
      limit: 30
    }).subscribe();

    const request = http.expectOne(req =>
      req.url === `${environment.apiBaseUrl}/user/me/communities/10/activity`
    );
    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('category')).toBe('ACCESS');
    expect(request.request.params.get('actorUserId')).toBe('7');
    expect(request.request.params.get('from')).toBe('2026-10-01T00:00:00');
    expect(request.request.params.get('to')).toBe('2026-10-04T23:59:59.999999');
    expect(request.request.params.get('cursor')).toBe('opaque');
    expect(request.request.params.get('limit')).toBe('30');
    request.flush({ items: [], nextCursor: null, hasMore: false });
  });

  it('reads actor options from the Community-scoped endpoint', () => {
    service.actors(10).subscribe();

    const request = http.expectOne(
      `${environment.apiBaseUrl}/user/me/communities/10/activity/actors`
    );
    expect(request.request.method).toBe('GET');
    request.flush([]);
  });
});
