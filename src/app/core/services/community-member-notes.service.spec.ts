import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../environments/environment';
import { CommunityMemberNotesService } from './community-member-notes.service';

describe('CommunityMemberNotesService', () => {
  let service: CommunityMemberNotesService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        CommunityMemberNotesService,
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    });
    service = TestBed.inject(CommunityMemberNotesService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists active notes by default and can include archived notes explicitly', () => {
    service.list(10, 7).subscribe();
    const active = http.expectOne(request =>
      request.url === `${environment.apiBaseUrl}/user/me/communities/10/members/7/notes`
      && request.params.get('includeArchived') === 'false'
    );
    expect(active.request.method).toBe('GET');
    active.flush([]);

    service.list(10, 7, true).subscribe();
    const archived = http.expectOne(request =>
      request.url === `${environment.apiBaseUrl}/user/me/communities/10/members/7/notes`
      && request.params.get('includeArchived') === 'true'
    );
    expect(archived.request.method).toBe('GET');
    archived.flush([]);
  });

  it('creates and updates notes without a delete contract', () => {
    service.create(10, 7, 'Nova nota').subscribe();
    const create = http.expectOne(
      `${environment.apiBaseUrl}/user/me/communities/10/members/7/notes`
    );
    expect(create.request.method).toBe('POST');
    expect(create.request.body).toEqual({ content: 'Nova nota' });
    create.flush({});

    service.update(10, 7, 100, 'Atualizada').subscribe();
    const update = http.expectOne(
      `${environment.apiBaseUrl}/user/me/communities/10/members/7/notes/100`
    );
    expect(update.request.method).toBe('PUT');
    expect(update.request.body).toEqual({ content: 'Atualizada' });
    update.flush({});
  });

  it('archives a note explicitly', () => {
    service.archive(10, 7, 100).subscribe();

    const request = http.expectOne(
      `${environment.apiBaseUrl}/user/me/communities/10/members/7/notes/100/archive`
    );
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({});
    request.flush({});
  });
});
