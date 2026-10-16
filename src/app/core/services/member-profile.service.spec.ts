import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { MemberProfileService } from './member-profile.service';

describe('MemberProfileService', () => {
  let service: MemberProfileService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [MemberProfileService, provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(MemberProfileService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('uses only self-service profile endpoints without a userId', () => {
    service.getProfile().subscribe();
    const profile = http.expectOne(`${environment.apiBaseUrl}/user/me/profile`);
    expect(profile.request.method).toBe('GET');
    expect(profile.request.urlWithParams).not.toContain('userId');
    expect(profile.request.urlWithParams).not.toContain('/admin/');
    profile.flush({});
  });

  it('loads context by communityId only', () => {
    service.getCommunityContext(42).subscribe();
    const request = http.expectOne(`${environment.apiBaseUrl}/user/me/communities/42/context`);
    expect(request.request.urlWithParams).not.toContain('userId');
    request.flush({});
  });

  it('loads moderation with backend pagination parameters', () => {
    service.getModeration(42, 2, 10).subscribe();
    const request = http.expectOne((candidate) => candidate.url === `${environment.apiBaseUrl}/user/me/communities/42/moderation`);
    expect(request.request.params.get('page')).toBe('2');
    expect(request.request.params.get('pageSize')).toBe('10');
    expect(request.request.urlWithParams).not.toContain('userId');
    request.flush({ items: [], page: 2, pageSize: 10, totalItems: 0, totalPages: 0 });
  });

  it('updates only the authenticated member display name', () => {
    service.updateDisplayName('Novo Nome').subscribe();
    const request = http.expectOne(`${environment.apiBaseUrl}/user/me/profile`);
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ displayName: 'Novo Nome' });
    expect(request.request.urlWithParams).not.toContain('userId');
    expect(request.request.urlWithParams).not.toContain('/admin/');
    request.flush({ userId: 1, displayName: 'Novo Nome' });
  });

  it('uploads a profile image as FormData without manually setting Content-Type', () => {
    const file = new File(['image'], 'avatar.png', { type: 'image/png' });
    service.uploadProfileImage(file).subscribe();
    const request = http.expectOne(`${environment.apiBaseUrl}/user/me/profile-image`);
    expect(request.request.method).toBe('PUT');
    expect(request.request.body instanceof FormData).toBeTrue();
    expect((request.request.body as FormData).get('file')).toBe(file);
    expect(request.request.headers.has('Content-Type')).toBeFalse();
    request.flush({ userId: 1, profileImageUrl: 'https://cdn.example/avatar.webp' });
  });

  it('deletes the authenticated member profile image without a userId', () => {
    service.deleteProfileImage().subscribe();
    const request = http.expectOne(`${environment.apiBaseUrl}/user/me/profile-image`);
    expect(request.request.method).toBe('DELETE');
    expect(request.request.urlWithParams).not.toContain('userId');
    expect(request.request.urlWithParams).not.toContain('/admin/');
    request.flush({ userId: 1, profileImageUrl: null });
  });
});
