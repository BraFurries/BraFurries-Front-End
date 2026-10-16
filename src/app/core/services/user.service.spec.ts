import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { User } from '../../shared/models/user';
import { UserService } from './user.service';

describe('UserService cached user state', () => {
  let service: UserService;
  let http: HttpTestingController;
  const user: User = { id: 1, name: 'Luna', email: 'luna@example.com', profileImageUrl: null, roles: ['member'], permissions: ['events:view'] };

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [UserService, provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(UserService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => { http.verify(); localStorage.clear(); });

  it('updates cached name and image while preserving session data, storage and reactive state', () => {
    const emitted: Array<User | null> = [];
    service.user$.subscribe((value) => emitted.push(value));
    service.login('luna@example.com', 'password', false).subscribe();
    http.expectOne((request) => request.url.endsWith('/auth/login')).flush({ access_token: 'access', refresh_token: null, expires_in: 3600, user });

    service.updateCachedUser({ name: 'Luna Nova', profileImageUrl: 'https://cdn.example/avatar.webp' });

    expect(service.getUser()).toEqual(jasmine.objectContaining({ name: 'Luna Nova', profileImageUrl: 'https://cdn.example/avatar.webp', email: user.email, roles: user.roles, permissions: user.permissions }));
    expect(JSON.parse(localStorage.getItem('logged_user') || '{}').accessToken).toBe('access');
    expect(emitted.at(-1)).toEqual(jasmine.objectContaining({ name: 'Luna Nova', profileImageUrl: 'https://cdn.example/avatar.webp' }));
  });

  it('keeps refresh credentials through a transient 503 and retries successfully', () => {
    service.login('luna@example.com', 'password', false).subscribe();
    http.expectOne((request) => request.url.endsWith('/auth/login')).flush({
      access_token: 'old-access', refresh_token: 'refresh-123', expires_in: 0, user
    });

    let firstSucceeded: boolean | undefined;
    service.refreshToken().subscribe(result => firstSucceeded = result);
    http.expectOne((request) => request.url.endsWith('/auth/refresh'))
      .flush({ message: 'temporarily unavailable' }, { status: 503, statusText: 'Service Unavailable' });

    expect(firstSucceeded).toBeFalse();
    expect(service.getAccessToken()).toBe('old-access');
    expect(JSON.parse(localStorage.getItem('logged_user') || '{}').refreshToken).toBe('refresh-123');

    let secondSucceeded: boolean | undefined;
    service.ensureValidSession().subscribe(result => secondSucceeded = result);
    http.expectOne((request) => request.url.endsWith('/auth/refresh')).flush({
      access_token: 'fresh-access', refresh_token: 'fresh-refresh', expires_in: 900
    });
    expect(secondSucceeded).toBeTrue();
    expect(service.getAccessToken()).toBe('fresh-access');
  });

  it('discards refresh credentials when the server rejects them as invalid', () => {
    service.login('luna@example.com', 'password', false).subscribe();
    http.expectOne((request) => request.url.endsWith('/auth/login')).flush({
      access_token: 'old-access', refresh_token: 'revoked-refresh', expires_in: 0, user
    });
    let refreshed: boolean | undefined;
    service.refreshToken().subscribe(value => refreshed = value);
    http.expectOne((request) => request.url.endsWith('/auth/refresh'))
      .flush({ message: 'invalid refresh token' }, { status: 401, statusText: 'Unauthorized' });

    expect(refreshed).toBeFalse();
    expect(service.getAccessToken()).toBeNull();
    expect(localStorage.getItem('logged_user')).toBeNull();
  });

  it('builds social login URL with the current frontend origin', () => {
    const url = (service as any).socialLoginStartUrl('discord') as string;

    expect(url).toContain('/auth/oauth2/discord?frontend_origin=');
    expect(url).toContain(encodeURIComponent(window.location.origin));
  });

  it('hydrates the global profile image from the OAuth callback into session, storage and reactive state', () => {
    const emitted: Array<User | null> = [];
    let callbackUser: User | undefined;
    service.user$.subscribe((value) => emitted.push(value));

    const params = new URLSearchParams({
      access_token: 'social-access',
      refresh_token: 'social-refresh',
      token_type: 'Bearer',
      expires_in: '3600',
      user_id: '7',
      name: 'Luna OAuth',
      email: 'luna@example.com',
      profile_image_url: 'https://cdn.example/avatar.webp',
      roles: 'member',
      permissions: 'events:view'
    });

    service.completeSocialLoginFromCallback(params).subscribe((value) => callbackUser = value);

    expect(callbackUser?.profileImageUrl).toBe('https://cdn.example/avatar.webp');
    expect(service.getUser()?.profileImageUrl).toBe('https://cdn.example/avatar.webp');
    expect(emitted.at(-1)?.profileImageUrl).toBe('https://cdn.example/avatar.webp');
    expect(JSON.parse(localStorage.getItem('logged_user') || '{}').user.profileImageUrl)
      .toBe('https://cdn.example/avatar.webp');
  });

  it('keeps the OAuth callback safe when no global profile image is provided', () => {
    const params = new URLSearchParams({
      access_token: 'social-access',
      user_id: '7',
      name: 'Luna OAuth',
      email: 'luna@example.com'
    });

    service.completeSocialLoginFromCallback(params).subscribe();

    expect(service.getUser()?.profileImageUrl).toBeNull();
  });

  it('publishes null on logout', () => {
    const emitted: Array<User | null> = [];
    service.user$.subscribe((value) => emitted.push(value));
    service.login('luna@example.com', 'password', false).subscribe();
    http.expectOne((request) => request.url.endsWith('/auth/login')).flush({ access_token: 'access', refresh_token: null, expires_in: 3600, user });
    service.logout().subscribe();
    expect(emitted.at(-1)).toBeNull();
  });
});
