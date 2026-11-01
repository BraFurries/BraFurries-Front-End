import { HttpClient, HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../environments/environment';
import { User } from '../../shared/models/user';
import { UserService } from '../services/user.service';
import { authTokenInterceptor } from './auth-token.interceptor';

describe('authTokenInterceptor', () => {
  let http: HttpTestingController;
  let client: HttpClient;
  let userService: UserService;

  const user: User = {
    id: 5, name: 'Membro', email: 'member@example.com',
    profileImageUrl: null, roles: [], permissions: []
  };

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authTokenInterceptor])),
        provideHttpClientTesting(),
        UserService
      ]
    });
    http = TestBed.inject(HttpTestingController);
    client = TestBed.inject(HttpClient);
    userService = TestBed.inject(UserService);
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  function login(expiresIn = 900, refreshToken: string | null = 'refresh-1'): void {
    userService.login('member@example.com', 'password', true).subscribe();
    http.expectOne(`${environment.apiBaseUrl}/auth/login`).flush({
      access_token: 'access-1', refresh_token: refreshToken,
      expires_in: expiresIn, user
    });
  }

  it('shares one rotating refresh between concurrent protected requests', () => {
    login(0);
    const results: unknown[] = [];
    client.get(`${environment.apiBaseUrl}/user`).subscribe(value => results.push(value));
    client.get(`${environment.apiBaseUrl}/user/me/dashboard`).subscribe(value => results.push(value));

    const refresh = http.match(`${environment.apiBaseUrl}/auth/refresh`);
    expect(refresh.length).toBe(1);
    refresh[0].flush({
      access_token: 'access-2', refresh_token: 'refresh-2', expires_in: 900
    });

    const requests = http.match(request =>
      request.url === `${environment.apiBaseUrl}/user` ||
      request.url === `${environment.apiBaseUrl}/user/me/dashboard`);
    expect(requests.length).toBe(2);
    expect(requests.every(request => request.request.headers.get('Authorization') === 'Bearer access-2')).toBeTrue();
    requests.forEach((request, index) => request.flush({ index }));
    expect(results.length).toBe(2);
  });

  it('retries one unauthorized request with newly rotated credentials without navigation', () => {
    login();
    let response: unknown;
    client.get(`${environment.apiBaseUrl}/user`).subscribe(value => response = value);

    const original = http.expectOne(`${environment.apiBaseUrl}/user`);
    expect(original.request.headers.get('Authorization')).toBe('Bearer access-1');
    original.flush({ message: 'Expired access token' }, { status: 401, statusText: 'Unauthorized' });

    http.expectOne(`${environment.apiBaseUrl}/auth/refresh`).flush({
      access_token: 'access-2', refresh_token: 'refresh-2', expires_in: 900
    });
    const retry = http.expectOne(`${environment.apiBaseUrl}/user`);
    expect(retry.request.headers.get('Authorization')).toBe('Bearer access-2');
    retry.flush({ ok: true });
    expect(response).toEqual({ ok: true });
  });

  it('preserves a recoverable session on a temporary refresh outage', () => {
    login(0);
    let seenError: HttpErrorResponse | null = null;
    client.get(`${environment.apiBaseUrl}/user`).subscribe({
      error: (error: HttpErrorResponse) => seenError = error
    });

    http.expectOne(`${environment.apiBaseUrl}/auth/refresh`)
      .flush({ message: 'Service unavailable' }, { status: 503, statusText: 'Unavailable' });

    expect(seenError?.status).toBe(503);
    expect(userService.getAccessToken()).toBe('access-1');
    expect(userService.hasRecoverableSession()).toBeTrue();
    http.expectNone(`${environment.apiBaseUrl}/user`);
  });

  it('does not forward credentials to unrelated hosts or public endpoints', () => {
    login();
    client.get('https://images.example.invalid/avatar').subscribe();
    const external = http.expectOne('https://images.example.invalid/avatar');
    expect(external.request.headers.has('Authorization')).toBeFalse();
    external.flush({});

    client.get(`${environment.apiBaseUrl}/public/community`).subscribe();
    const publicRequest = http.expectOne(`${environment.apiBaseUrl}/public/community`);
    expect(publicRequest.request.headers.has('Authorization')).toBeFalse();
    publicRequest.flush({});
  });

  it('never tries to refresh authorization failures unrelated to expiration', () => {
    login();
    let failedStatus = 0;
    client.get(`${environment.apiBaseUrl}/user`).subscribe({
      error: (error: HttpErrorResponse) => failedStatus = error.status
    });
    http.expectOne(`${environment.apiBaseUrl}/user`)
      .flush({ message: 'Forbidden' }, { status: 403, statusText: 'Forbidden' });
    expect(failedStatus).toBe(403);
    http.expectNone(`${environment.apiBaseUrl}/auth/refresh`);
  });
});
