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

  it('uses one rotating refresh for simultaneous callers and retains the route credentials', () => {
    service.login('luna@example.com', 'password', true).subscribe();
    http.expectOne((request) => request.url.endsWith('/auth/login')).flush({
      access_token: 'old-access', refresh_token: 'old-refresh', expires_in: 0, user
    });

    const results: boolean[] = [];
    service.ensureValidSession().subscribe(value => results.push(value));
    service.ensureValidSession().subscribe(value => results.push(value));

    const pending = http.match((request) => request.url.endsWith('/auth/refresh'));
    expect(pending.length).toBe(1);
    expect(pending[0].request.body.refresh_token).toBe('old-refresh');
    pending[0].flush({
      access_token: 'new-access', refresh_token: 'rotated-refresh', expires_in: 900
    });

    expect(results).toEqual([true, true]);
    expect(service.getAccessToken()).toBe('new-access');
    expect(JSON.parse(localStorage.getItem('logged_user') || '{}').refreshToken).toBe('rotated-refresh');
    expect(service.hasRecoverableSession()).toBeTrue();
  });

  it('does not restore a logged-out session from a late refresh response', () => {
    service.login('luna@example.com', 'password', true).subscribe();
    http.expectOne((request) => request.url.endsWith('/auth/login')).flush({
      access_token: 'old-access', refresh_token: 'old-refresh', expires_in: 0, user
    });

    const refreshed: boolean[] = [];
    service.refreshToken().subscribe(value => refreshed.push(value));
    const refresh = http.expectOne((request) => request.url.endsWith('/auth/refresh'));

    service.logout().subscribe();
    http.expectOne((request) => request.url.endsWith('/auth/logout')).flush({ message: 'ok' });
    refresh.flush({ access_token: 'late-access', refresh_token: 'late-refresh', expires_in: 900 });

    expect(refreshed).toEqual([false]);
    expect(service.getAccessToken()).toBeNull();
    expect(localStorage.getItem('logged_user')).toBeNull();
  });

  it('keeps newly rotated tokens when an older /user request finishes afterwards', () => {
    service.login('luna@example.com', 'password', true).subscribe();
    http.expectOne((request) => request.url.endsWith('/auth/login')).flush({
      access_token: 'old-access', refresh_token: 'old-refresh', expires_in: 0, user
    });

    service.getUserDetails().subscribe();
    const details = http.expectOne((request) => request.url.endsWith('/user'));
    service.refreshToken().subscribe();
    http.expectOne((request) => request.url.endsWith('/auth/refresh')).flush({
      access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 900
    });

    details.flush({ ...user, name: 'Luna atualizado' });
    expect(service.getAccessToken()).toBe('new-access');
    expect(JSON.parse(localStorage.getItem('logged_user') || '{}').refreshToken).toBe('new-refresh');
    expect(service.getUser()?.name).toBe('Luna atualizado');
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

  it('submits distinct, acknowledged account consolidation rather than link confirmation', () => {
    let outcome: string | undefined;
    service.consolidateDiscordLink('verified-ticket', true).subscribe(result => outcome = result.status);
    const request = http.expectOne((r) => r.url.endsWith('/user/me/discord-link/consolidate'));
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      ticket: 'verified-ticket', acknowledgeDiscordHistoryOwner: true
    });
    request.flush({
      status: 'CONSOLIDATED_RELOGIN_REQUIRED',
      canonicalUserId: 20, notice: 'Entre novamente'
    });
    expect(outcome).toBe('CONSOLIDATED_RELOGIN_REQUIRED');
  });

  it('clears both access and refresh credentials immediately after merging users', () => {
    service.login('luna@example.com', 'password', true).subscribe();
    http.expectOne((r) => r.url.endsWith('/auth/login')).flush({
      access_token: 'old-access', refresh_token: 'old-refresh', expires_in: 3600, user
    });
    const seen: Array<User | null> = [];
    service.user$.subscribe(value => seen.push(value));

    service.finishAccountConsolidation();

    expect(service.getAccessToken()).toBeNull();
    expect(service.hasRecoverableSession()).toBeFalse();
    expect(localStorage.getItem('logged_user')).toBeNull();
    expect(seen.at(-1)).toBeNull();
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
