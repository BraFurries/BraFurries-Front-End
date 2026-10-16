import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { UserReliability } from '../models/user-reliability.model';
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, catchError, map, of, switchMap, tap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthResponse } from '../../shared/models/api/auth/authResponse';
import { User } from '../../shared/models/user';
import { DashboardResponse } from '../../shared/models/api/dashboard/dashboardResponse';
interface LoginRequest {
  email: string;
  password: string;
  rememberMe: boolean;
}

interface RegisterRequest {
  displayName: string;
  email: string;
  password: string;
  passwordConfirmation: string;
  termsAgreement: boolean;
}

interface SocialRegisterRequest {
  registrationToken: string;
  displayName: string;
  termsAgreement: boolean;
}

interface LogoutRequest {
  refresh_token: string;
}

interface UserSession {
  user: User;
  accessToken: string;
  refreshToken: string | null;
  tokenType: string;
  expiresAt: string;
}

type RefreshTokenResponse = Omit<AuthResponse, 'user'> & Partial<Pick<AuthResponse, 'user'>>;
export type SocialAuthProvider = 'google' | 'discord';

@Injectable({
  providedIn: 'root'
})
export class UserService {
  private readonly storageKey = 'logged_user';
  private readonly socialLoginReturnUrlKey = 'social_login_return_url';
  private session: UserSession | null = this.loadUserFromStorage();
  private readonly currentUserSubject = new BehaviorSubject<User | null>(this.session?.user ?? null);
  readonly user$ = this.currentUserSubject.asObservable();

  constructor(private http: HttpClient) { }

  login(email: string, password: string, rememberMe: boolean): Observable<User> {
    const endpoint = `${environment.apiBaseUrl}/auth/login`;
    const payload: LoginRequest = {
      email,
      password,
      rememberMe
    };

    return this.http.post<AuthResponse>(endpoint, payload).pipe(
      map((response) => {
        const session = this.mapAuthResponseToSession(response);
        this.setSession(session);
        return session.user;
      })
    );
  }

  register(
    displayName: string,
    email: string,
    password: string,
    passwordConfirmation: string,
    termsAgreement: boolean
  ): Observable<void> {
    const endpoint = `${environment.apiBaseUrl}/auth/register`;
    const payload: RegisterRequest = {
      displayName,
      email,
      password,
      passwordConfirmation,
      termsAgreement
    };

    return this.http.post<void>(endpoint, payload, { observe: 'response' }).pipe(
      map(() => undefined)
    );
  }

  confirmEmail(token: string): Observable<void> {
    const endpoint = `${environment.apiBaseUrl}/auth/confirm-email`;
    return this.http.post<void>(endpoint, { token });
  }

  forgotPassword(email: string): Observable<{ message: string }> {
    const endpoint = `${environment.apiBaseUrl}/auth/forgot-password`;
    return this.http.post<{ message: string }>(endpoint, { email });
  }

  resetPassword(token: string, password: string): Observable<void> {
    const endpoint = `${environment.apiBaseUrl}/auth/reset-password`;
    return this.http.post<void>(endpoint, { token, password });
  }

  completeSocialRegistration(
    registrationToken: string,
    displayName: string,
    termsAgreement: boolean
  ): Observable<User> {
    const endpoint = `${environment.apiBaseUrl}/auth/social-register`;
    const payload: SocialRegisterRequest = {
      registrationToken,
      displayName,
      termsAgreement
    };

    return this.http.post<AuthResponse>(endpoint, payload).pipe(
      map((response) => {
        const session = this.mapAuthResponseToSession(response);
        this.setSession(session);
        return session.user;
      })
    );
  }

  startSocialLogin(provider: SocialAuthProvider, returnUrl: string = '/painel'): void {
    sessionStorage.setItem(this.socialLoginReturnUrlKey, returnUrl);

    window.location.href = this.socialLoginStartUrl(provider);
  }

  completeSocialLoginFromCallback(params: URLSearchParams): Observable<User> {
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    const tokenType = params.get('token_type') ?? 'Bearer';
    const expiresIn = Number(params.get('expires_in') ?? 3600);
    const code = params.get('code');
    const state = params.get('state');

    if (accessToken) {
      const session: UserSession = {
        user: this.getUserFromCallback(params),
        accessToken,
        refreshToken,
        tokenType,
        expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString()
      };

      this.setSession(session);
      return of(session.user);
    }

    if (!code) {
      return throwError(() => new Error('Social auth callback missing authorization code or tokens.'));
    }

    const endpoint = `${environment.apiBaseUrl}/auth/social-login`;
    return this.http.post<AuthResponse>(endpoint, {
      code,
      state,
      redirectUri: `${window.location.origin}/social-login`
    }).pipe(
      map((response) => {
        const session = this.mapAuthResponseToSession(response);
        this.setSession(session);
        return session.user;
      })
    );
  }

  getSocialLoginReturnUrl(state: string | null): string {
    const storedReturnUrl = sessionStorage.getItem(this.socialLoginReturnUrlKey);
    sessionStorage.removeItem(this.socialLoginReturnUrlKey);

    if (!state) {
      return storedReturnUrl || '/painel';
    }

    try {
      const parsedState = JSON.parse(atob(state)) as Partial<{ returnUrl: string }>;
      return parsedState.returnUrl || storedReturnUrl || '/painel';
    } catch {
      return storedReturnUrl || '/painel';
    }
  }

  logout(): Observable<boolean> {
    const endpoint = `${environment.apiBaseUrl}/auth/logout`;
    const currentSession = this.session;

    if (!currentSession?.refreshToken) {
      this.clearSession();
      return of(true);
    }

    const payload: LogoutRequest = { refresh_token: currentSession.refreshToken };

    return this.http.post(endpoint, payload).pipe(
      map(() => true),
      catchError(() => of(false)),
      tap(() => this.clearSession())
    );
  }

  refreshToken(): Observable<boolean> {
    const currentSession = this.session;

    if (!currentSession?.refreshToken) {
      this.clearSession();
      return of(false);
    }

    const endpoint = `${environment.apiBaseUrl}/auth/refresh`;
    return this.http.post<RefreshTokenResponse>(endpoint, { refresh_token: currentSession.refreshToken }).pipe(
      tap((response) => {
        this.setSession(this.mapAuthResponseToSession(response, currentSession.user));
      }),
      map(() => true),
      catchError((error: unknown) => {
        // Connectivity, server outages and temporary throttling do not mean
        // the refresh token was revoked. Preserve it so streaming (and other
        // authenticated workflows) can retry after the network recovers.
        const transient = error instanceof HttpErrorResponse && (
          error.status === 0 || error.status === 408
          || error.status === 429 || error.status >= 500
        );
        if (!transient) this.clearSession();
        return of(false);
      })
    );
  }

  getUserDetails(): Observable<User | null> {
    const currentSession = this.session;

    if (!currentSession?.accessToken) {
      return of(null);
    }

    const endpoint = `${environment.apiBaseUrl}/user`;
    return this.http.get<User>(endpoint).pipe(
      tap((userDetails) => {
        this.setSession({
          ...currentSession,
          user: userDetails
        });
      }),
      map(() => this.session?.user ?? null),
      catchError(() => of(this.session?.user ?? null))
    );
  }

  getDashboardData(): Observable<DashboardResponse> {
    const endpoint = `${environment.apiBaseUrl}/user/me/dashboard`;
    return this.http.get<DashboardResponse>(endpoint);
  }

  getUserReliability(id?: number, email?: string): Observable<UserReliability> {
    const endpoint = `${environment.apiBaseUrl}/admin/users/reliability`;
    let params = new HttpParams();
    if (id !== undefined) params = params.set('id', id.toString());
    if (email) params = params.set('email', email);

    return this.http.get<UserReliability>(endpoint, { params });
  }

  getUser(): User | null {
    return this.session?.user ?? null;
  }

  updateCachedUser(patch: Partial<Pick<User, 'name' | 'profileImageUrl'>>): User {
    if (!this.session) {
      throw new Error('Não há sessão ativa para atualizar o perfil.');
    }

    const user: User = { ...this.session.user, ...patch };
    this.setSession({ ...this.session, user });
    return user;
  }

  getAccessToken(): string | null {
    return this.session?.accessToken ?? null;
  }

  getTokenType(): string {
    return this.session?.tokenType ?? 'Bearer';
  }

  ensureValidSession(): Observable<boolean> {
    if (!this.session) {
      return of(false);
    }

    if (this.hasValidToken(this.session)) {
      return of(true);
    }

    return this.refreshToken().pipe(
      switchMap((refreshOk) => of(refreshOk && this.session !== null))
    );
  }

  private socialLoginStartUrl(provider: SocialAuthProvider): string {
    const frontendOrigin = encodeURIComponent(window.location.origin);
    return `${environment.apiBaseUrl}/auth/oauth2/${provider}?frontend_origin=${frontendOrigin}`;
  }

  private setSession(session: UserSession): void {
    this.session = session;
    localStorage.setItem(this.storageKey, JSON.stringify(session));
    this.currentUserSubject.next(session.user);
  }

  private clearSession(): void {
    this.session = null;
    localStorage.removeItem(this.storageKey);
    localStorage.removeItem('hideDiscordWarning');
    this.currentUserSubject.next(null);
  }

  private hasValidToken(session: UserSession): boolean {
    return new Date(session.expiresAt).getTime() > Date.now();
  }

  private mapAuthResponseToSession(response: RefreshTokenResponse, fallbackUser?: User): UserSession {
    const user = response.user ?? fallbackUser;
    const accessToken = response.access_token ?? response.accessToken;
    const refreshToken = response.refresh_token ?? response.refreshToken ?? null;
    const tokenType = response.token_type ?? response.tokenType ?? 'Bearer';
    const expiresIn = response.expires_in ?? response.expiresIn ?? 3600;

    if (!user) {
      throw new Error('Auth response missing user payload.');
    }

    if (!accessToken) {
      throw new Error('Auth response missing access token.');
    }

    return {
      user,
      accessToken,
      refreshToken,
      tokenType,
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString()
    };
  }

  private getUserFromCallback(params: URLSearchParams): User {
    return {
      id: Number(params.get('user_id') ?? 0),
      name: params.get('name') ?? params.get('display_name') ?? '',
      email: params.get('email') ?? '',
      profileImageUrl: params.get('profile_image_url') || null,
      roles: this.getArrayParam(params, 'roles'),
      permissions: this.getArrayParam(params, 'permissions')
    };
  }

  private getArrayParam(params: URLSearchParams, key: string): string[] {
    const value = params.get(key);

    if (!value) {
      return [];
    }

    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }

  private loadUserFromStorage(): UserSession | null {
    const rawSession = localStorage.getItem(this.storageKey);

    if (!rawSession) {
      return null;
    }

    try {
      return JSON.parse(rawSession) as UserSession;
    } catch {
      localStorage.removeItem(this.storageKey);
      return null;
    }
  }
}
