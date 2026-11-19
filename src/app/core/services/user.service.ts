import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { UserReliability } from '../models/user-reliability.model';
import { Injectable, InjectionToken, OnDestroy, inject } from '@angular/core';
import { BehaviorSubject, Observable, catchError, defer, finalize, firstValueFrom, from, map, of, shareReplay, tap, throwError, timer } from 'rxjs';
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
  email: string;
  password: string;
  passwordConfirmation: string;
  termsAgreement: boolean;
}

export interface SocialOnboardingPreview {
  provider: 'google' | 'discord';
  suggestedEmail: string | null;
  displayName: string | null;
}

interface LogoutRequest {
  refresh_token: string;
}

interface UserSession {
  /** Stable per login, not per token rotation. Optional for pre-existing sessions. */
  sessionId?: string;
  user: User;
  accessToken: string;
  refreshToken: string | null;
  tokenType: string;
  expiresAt: string;
}

interface CachedSessionProfile {
  identity: string;
  user: User;
}

/** Native origin-scoped lock, shared by all tabs in secure browser contexts. */
export const BROWSER_SESSION_LOCKS = new InjectionToken<LockManager | null>('Browser session locks', {
  providedIn: 'root',
  factory: () => typeof navigator !== 'undefined' && navigator.locks ? navigator.locks : null
});

type RefreshTokenResponse = Omit<AuthResponse, 'user'> & Partial<Pick<AuthResponse, 'user'>>;
export type SocialAuthProvider = 'google' | 'discord';

export interface SocialProviderLogin {
  identityId: number;
  provider: SocialAuthProvider;
  loginEnabled: boolean;
}
export interface SocialLoginChangeResult {
  status: 'RELOGIN_REQUIRED' | 'ALREADY_DISABLED' | 'ALREADY_ENABLED';
}
export interface LocalEmailProofStatus {
  email: string | null;
  verified: boolean;
}
export interface LocalEmailProofRequestResult {
  status: 'ALREADY_VERIFIED' | 'VERIFICATION_SENT_RELOGIN_REQUIRED';
}

export type DiscordLinkStatus =
  'CONNECT_READY' | 'PRECHECK_REQUIRED' | 'RESOLUTION_REQUIRED' | 'REVIEW_REQUIRED';

export interface DiscordConsolidationPlan {
  status: 'AUTO_MERGE_CANDIDATE' | 'RESOLUTION_REQUIRED' | 'REVIEW_REQUIRED';
  preferredCanonicalAccount: 'DISCORD_HISTORY_OWNER' | 'UNDECIDED';
  preservationPolicies: string[];
  nextActions: string[];
}
export interface DiscordLinkPreview {
  discordUsername: string;
  hasExistingHistory: boolean;
  status: DiscordLinkStatus;
  nextActions: string[];
  notice: string;
  consolidationPlan: DiscordConsolidationPlan | null;
}
export interface DiscordLinkConfirmation {
  status: 'CONNECTED' | 'ALREADY_CONNECTED';
  notice: string;
}
export interface DiscordConsolidationResult {
  status: 'CONSOLIDATED_RELOGIN_REQUIRED';
  canonicalUserId: number;
  notice: string;
}

@Injectable({
  providedIn: 'root'
})
export class UserService implements OnDestroy {
  private readonly storageKey = 'logged_user';
  private readonly profileKey = 'logged_user_profile';
  private readonly locks = inject(BROWSER_SESSION_LOCKS);
  private lastStoredSession: string | null = null;
  private lastStoredProfile: string | null = null;
  private readonly socialLoginReturnUrlKey = 'social_login_return_url';
  private readonly accountConsolidatedNoticeKey = 'account_consolidated_notice';
  private session: UserSession | null = this.loadUserFromStorage();
  private refreshInFlight$: Observable<boolean> | null = null;
  private refreshingIdentity: string | null = null;
  private readonly currentUserSubject = new BehaviorSubject<User | null>(this.session?.user ?? null);
  readonly user$ = this.currentUserSubject.asObservable();

  private readonly onStorage = (event: StorageEvent): void => {
    if (event.key === null || event.key === this.storageKey || event.key === this.profileKey) {
      this.syncSession();
    }
  };

  constructor(private http: HttpClient) {
    if (typeof window !== 'undefined') window.addEventListener('storage', this.onStorage);
  }

  ngOnDestroy(): void {
    if (typeof window !== 'undefined') window.removeEventListener('storage', this.onStorage);
  }

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

  resendEmailConfirmation(email: string, password: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(
      `${environment.apiBaseUrl}/auth/resend-confirmation`, { email, password }
    );
  }

  forgotPassword(email: string): Observable<{ message: string }> {
    const endpoint = `${environment.apiBaseUrl}/auth/forgot-password`;
    return this.http.post<{ message: string }>(endpoint, { email });
  }

  resetPassword(token: string, password: string): Observable<void> {
    const endpoint = `${environment.apiBaseUrl}/auth/reset-password`;
    return this.http.post<void>(endpoint, { token, password });
  }

  /** The provider's optional e-mail is merely a suggestion fetched by opaque proof. */
  previewSocialRegistration(registrationToken: string): Observable<SocialOnboardingPreview> {
    return this.http.post<SocialOnboardingPreview>(
      `${environment.apiBaseUrl}/auth/social-register/preview`, { registrationToken }
    );
  }

  /** Onboarding never creates a logged-in session before local e-mail verification. */
  completeSocialRegistration(
    registrationToken: string,
    displayName: string,
    email: string,
    password: string,
    passwordConfirmation: string,
    termsAgreement: boolean
  ): Observable<{ id: number; email: string; message: string }> {
    const endpoint = `${environment.apiBaseUrl}/auth/social-register`;
    const payload: SocialRegisterRequest = {
      registrationToken, displayName, email, password, passwordConfirmation, termsAgreement
    };
    return this.http.post<{ id: number; email: string; message: string }>(endpoint, payload);
  }

  /** Start a separate OAuth proof without logging out or replacing the current session. */
  beginDiscordLink(): Observable<{ ticket: string }> {
    return this.http.post<{ ticket: string }>(
      `${environment.apiBaseUrl}/user/me/discord-link/start`, {}
    );
  }

  openDiscordLinkOAuth(ticket: string): void {
    const frontendOrigin = encodeURIComponent(window.location.origin);
    const proof = encodeURIComponent(ticket);
    window.location.assign(
      `${environment.apiBaseUrl}/auth/oauth2/discord?link_ticket=${proof}&frontend_origin=${frontendOrigin}`
    );
  }

  previewDiscordLink(ticket: string): Observable<DiscordLinkPreview> {
    return this.http.get<DiscordLinkPreview>(
      `${environment.apiBaseUrl}/user/me/discord-link/preview`,
      { params: { ticket } }
    );
  }

  confirmDiscordLink(ticket: string): Observable<DiscordLinkConfirmation> {
    return this.http.post<DiscordLinkConfirmation>(
      `${environment.apiBaseUrl}/user/me/discord-link/confirm`, { ticket }
    );
  }

  /** Manage login permission only; never delete a provider subject or Discord history. */
  getSocialLogins(): Observable<SocialProviderLogin[]> {
    return this.http.get<SocialProviderLogin[]>(
      `${environment.apiBaseUrl}/user/me/social-logins`
    );
  }

  disableSocialLogin(identityId: number, password: string): Observable<SocialLoginChangeResult> {
    return this.http.post<SocialLoginChangeResult>(
      `${environment.apiBaseUrl}/user/me/social-logins/${identityId}/disable`, { password }
    );
  }

  enableDiscordLogin(ticket: string, password: string): Observable<SocialLoginChangeResult> {
    return this.http.post<SocialLoginChangeResult>(
      `${environment.apiBaseUrl}/user/me/social-logins/discord/enable`, { ticket, password }
    );
  }

  beginGoogleLoginProof(): Observable<{ticket: string}> {
    return this.http.post<{ticket: string}>(
      `${environment.apiBaseUrl}/user/me/social-logins/google/start`, {}
    );
  }

  openGoogleReactivationOAuth(ticket: string): void {
    const frontendOrigin = encodeURIComponent(window.location.origin);
    const proof = encodeURIComponent(ticket);
    window.location.assign(
      `${environment.apiBaseUrl}/auth/oauth2/google?reenable_ticket=${proof}&frontend_origin=${frontendOrigin}`
    );
  }

  enableGoogleLogin(ticket: string, password: string): Observable<SocialLoginChangeResult> {
    return this.http.post<SocialLoginChangeResult>(
      `${environment.apiBaseUrl}/user/me/social-logins/google/enable-oauth`,
      { ticket, password }
    );
  }

  /** Bind a first-time Google identity using local password and fresh OAuth proof. */
  connectGoogleLogin(ticket: string, password: string): Observable<SocialLoginChangeResult> {
    return this.http.post<SocialLoginChangeResult>(
      `${environment.apiBaseUrl}/user/me/social-logins/google/connect-oauth`,
      { ticket, password }
    );
  }

  getLocalEmailProof(): Observable<LocalEmailProofStatus> {
    return this.http.get<LocalEmailProofStatus>(
      `${environment.apiBaseUrl}/user/me/local-email-verification`
    );
  }

  requestLocalEmailProof(email: string, password: string): Observable<LocalEmailProofRequestResult> {
    return this.http.post<LocalEmailProofRequestResult>(
      `${environment.apiBaseUrl}/user/me/local-email-verification`, { email, password }
    );
  }

  /** A security change increments auth_version and invalidates all sessions. */
  finishSocialLoginSecurityChange(): void {
    this.clearSession();
    sessionStorage.removeItem(this.socialLoginReturnUrlKey);
  }

  /** A distinct endpoint: cross-user consolidation requires explicit canonical consent. */
  consolidateDiscordLink(ticket: string, acknowledgeDiscordHistoryOwner: boolean): Observable<DiscordConsolidationResult> {
    return this.http.post<DiscordConsolidationResult>(
      `${environment.apiBaseUrl}/user/me/discord-link/consolidate`,
      { ticket, acknowledgeDiscordHistoryOwner }
    );
  }

  /** Both prior JWT and refresh token were revoked atomically by the API. */
  finishAccountConsolidation(): void {
    this.clearSession();
    sessionStorage.removeItem(this.socialLoginReturnUrlKey);
    sessionStorage.setItem(this.accountConsolidatedNoticeKey, '1');
  }

  consumeAccountConsolidationNotice(): boolean {
    const confirmed = sessionStorage.getItem(this.accountConsolidatedNoticeKey) === '1';
    sessionStorage.removeItem(this.accountConsolidatedNoticeKey);
    return confirmed;
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
        sessionId: this.newSessionId(),
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
    const requestedIdentity = this.getSessionIdentity();
    if (!requestedIdentity) return of(true);
    // Serialize logout with a rotation so the API revokes the latest token.
    return this.withSessionLock(() => {
      this.syncSession();
      const current = this.session;
      if (!current || this.identity(current) !== requestedIdentity) return of(true);
      this.clearSession();
      if (!current.refreshToken) return of(true);
      const payload: LogoutRequest = { refresh_token: current.refreshToken };
      return this.http.post(`${environment.apiBaseUrl}/auth/logout`, payload).pipe(
        map(() => true),
        catchError(() => of(false))
      );
    });
  }

  refreshToken(expectedIdentity?: string): Observable<boolean> {
    this.syncSession();
    const requested = this.session;
    if (expectedIdentity && (!requested || this.identity(requested) !== expectedIdentity)) return of(false);
    if (!requested?.refreshToken) {
      if (requested) this.clearSession();
      return of(false);
    }
    const identity = this.identity(requested);
    if (this.refreshInFlight$ && this.refreshingIdentity === identity) return this.refreshInFlight$;

    // In addition to sharing the single-tab request, coordinate with other
    // tabs before sending a rotating credential. Always reread storage inside
    // the lock: a tab that waited may already have fresh credentials.
    const refresh$ = this.withSessionLock(() => this.refreshCurrentSession(requested)).pipe(
      catchError(() => of(false)),
      finalize(() => {
        if (this.refreshInFlight$ === refresh$) {
          this.refreshInFlight$ = null;
          this.refreshingIdentity = null;
        }
      }),
      shareReplay({ bufferSize: 1, refCount: false })
    );
    this.refreshingIdentity = identity;
    this.refreshInFlight$ = refresh$;
    return refresh$;
  }

  private withSessionLock<T>(action: () => Observable<T>): Observable<T> {
    if (!this.locks) return defer(action);
    return defer(() => from(this.locks!.request('brf.auth.session.v1',
      () => firstValueFrom(action()))));
  }

  private refreshCurrentSession(requested: UserSession): Observable<boolean> {
    this.syncSession();
    const current = this.session;
    if (!current?.refreshToken || this.identity(current) !== this.identity(requested)) return of(false);
    if (current.refreshToken !== requested.refreshToken && this.hasValidToken(current)) return of(true);

    return this.http.post<RefreshTokenResponse>(
      `${environment.apiBaseUrl}/auth/refresh`, { refresh_token: current.refreshToken }
    ).pipe(
      map(response => {
        this.syncSession();
        if (!this.session || this.identity(this.session) !== this.identity(current) ||
            this.session.refreshToken !== current.refreshToken) {
          // A logout/new login or another rotation won. Never revive old
          // credentials or replace a newly authenticated account.
          return !!this.session && this.identity(this.session) === this.identity(current) &&
            this.hasValidToken(this.session);
        }
        const next = this.mapAuthResponseToSession(response, this.session.user);
        if (!next.refreshToken) throw new Error('Refresh response missing rotated credential.');
        this.setSession({ ...next, sessionId: current.sessionId });
        return true;
      }),
      catchError((error: unknown) => {
        // Only the refresh endpoint's explicit credential rejection ends a
        // session. Connectivity, throttling, server/protocol errors do not.
        if (!(error instanceof HttpErrorResponse) || ![400, 401, 403].includes(error.status)) {
          return of(false);
        }
        const resolveRejection = (): boolean => {
          this.syncSession();
          if (!this.session || this.identity(this.session) !== this.identity(current)) return false;
          if (this.session.refreshToken !== current.refreshToken) return this.hasValidToken(this.session);
          this.clearSession();
          return false;
        };
        // Older browsers lack an atomic cross-tab lock. Allow a competing
        // successful rotation a short opportunity to publish before treating
        // the stale token as rejected. Never retry a consumed credential.
        return this.locks ? of(resolveRejection()) : timer(1500).pipe(map(resolveRejection));
      })
    );
  }

  getUserDetails(): Observable<User | null> {
    this.syncSession();
    const current = this.session;
    if (!current?.accessToken) return of(null);

    const currentUserForRequest = (): User | null => {
      this.syncSession();
      return this.session && this.identity(this.session) === this.identity(current) ? this.session.user : null;
    };
    return this.http.get<User>(`${environment.apiBaseUrl}/user`).pipe(
      tap(userDetails => {
        this.syncSession();
        if (this.session && this.identity(this.session) === this.identity(current) &&
            userDetails.id === current.user.id) {
          this.cacheProfile(userDetails);
        }
      }),
      map(currentUserForRequest),
      catchError(() => of(currentUserForRequest()))
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
    this.syncSession();
    return this.session?.user ?? null;
  }

  getSessionIdentity(): string | null {
    return this.getSessionCredentials()?.identity ?? null;
  }

  /** Atomic in-memory snapshot: callers must not mix credentials read from
   * distinct storage revisions while another tab changes accounts. */
  getSessionCredentials(): { identity: string; accessToken: string; tokenType: string } | null {
    this.syncSession();
    const session = this.session;
    return session ? { identity: this.identity(session), accessToken: session.accessToken,
      tokenType: session.tokenType } : null;
  }

  updateCachedUser(patch: Partial<Pick<User, 'name' | 'profileImageUrl'>>): User {
    this.syncSession();
    if (!this.session) {
      throw new Error('Não há sessão ativa para atualizar o perfil.');
    }

    const user: User = { ...this.session.user, ...patch };
    this.cacheProfile(user);
    return user;
  }

  getAccessToken(): string | null {
    this.syncSession();
    return this.session?.accessToken ?? null;
  }

  hasRecoverableSession(): boolean {
    this.syncSession();
    return Boolean(this.session?.refreshToken);
  }

  getTokenType(): string {
    this.syncSession();
    return this.session?.tokenType ?? 'Bearer';
  }

  ensureValidSession(): Observable<boolean> {
    this.syncSession();
    if (!this.session) {
      return of(false);
    }

    if (this.hasValidToken(this.session)) {
      return of(true);
    }

    return this.refreshToken().pipe(
      map(refreshOk => refreshOk && this.session !== null)
    );
  }

  private socialLoginStartUrl(provider: SocialAuthProvider): string {
    const frontendOrigin = encodeURIComponent(window.location.origin);
    return `${environment.apiBaseUrl}/auth/oauth2/${provider}?frontend_origin=${frontendOrigin}`;
  }

  private newSessionId(): string {
    // An opaque client-side correlation ID, never an authorization credential.
    return globalThis.crypto.randomUUID?.() ??
      Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)),
        byte => byte.toString(16).padStart(2, '0')).join('');
  }

  private identity(session: UserSession): string {
    return session.sessionId
      ? `login:${session.user.id}:${session.sessionId}`
      : `legacy:${session.user.id}`;
  }

  private setSession(session: UserSession): void {
    const raw = JSON.stringify(session);
    localStorage.setItem(this.storageKey, raw);
    this.lastStoredSession = raw;
    this.session = session;
    this.currentUserSubject.next(session.user);
  }

  private cacheProfile(user: User): void {
    if (!this.session) return;
    // Profile writes never touch the credential bundle. A stale tab cannot
    // overwrite a refresh token even if it updates a user at the same time.
    const raw = JSON.stringify({ identity: this.identity(this.session), user });
    localStorage.setItem(this.profileKey, raw);
    this.lastStoredProfile = raw;
    this.session = { ...this.session, user };
    this.currentUserSubject.next(user);
  }

  private syncSession(): void {
    const raw = localStorage.getItem(this.storageKey);
    const profile = localStorage.getItem(this.profileKey);
    if (raw === this.lastStoredSession && profile === this.lastStoredProfile) return;
    this.lastStoredSession = raw;
    this.lastStoredProfile = profile;
    const previous = this.session;
    this.session = this.parseStoredSession(raw, profile);
    if ((previous ? this.identity(previous) : null) !== (this.session ? this.identity(this.session) : null) ||
        JSON.stringify(previous?.user ?? null) !== JSON.stringify(this.session?.user ?? null)) {
      this.currentUserSubject.next(this.session?.user ?? null);
    }
  }

  private clearSession(): void {
    this.session = null;
    localStorage.removeItem(this.storageKey);
    localStorage.removeItem(this.profileKey);
    this.lastStoredSession = null;
    this.lastStoredProfile = null;
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
      sessionId: this.newSessionId(),
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
    this.lastStoredSession = localStorage.getItem(this.storageKey);
    this.lastStoredProfile = localStorage.getItem(this.profileKey);
    return this.parseStoredSession(this.lastStoredSession, this.lastStoredProfile);
  }

  private parseStoredSession(raw: string | null, profile: string | null): UserSession | null {
    if (!raw) return null;
    let session: UserSession;
    try {
      session = JSON.parse(raw) as UserSession;
      if (!session?.user || !session.accessToken) return null;
    } catch {
      return null;
    }
    if (profile) {
      try {
        const cached = JSON.parse(profile) as CachedSessionProfile;
        if (cached.identity === this.identity(session) && cached.user?.id === session.user.id) {
          session = { ...session, user: cached.user };
        }
      } catch {
        // Invalid cached profile must not invalidate otherwise valid tokens.
      }
    }
    return session;
  }
}
