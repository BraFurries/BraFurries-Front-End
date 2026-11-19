import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { UserService } from '../services/user.service';

export const authTokenInterceptor: HttpInterceptorFn = (request, next) => {
  const userService = inject(UserService);

  // Never attach user credentials or trigger session refresh for unrelated
  // origins, public endpoints, or the auth endpoints themselves.
  if (!isApiRequest(request.url) || isPublicRequest(request.url) || isAuthRequest(request.url)) {
    return next(request);
  }

  // Never combine a token and identity read from different storage revisions.
  // An in-flight request must not be retried as a different login.
  const identity = userService.getSessionIdentity();
  const authorized = (credentials: { accessToken: string; tokenType: string }): HttpRequest<unknown> => request.clone({
    setHeaders: { Authorization: `${credentials.tokenType} ${credentials.accessToken}` }
  });
  const sessionChanged = () => new HttpErrorResponse({
    status: 401, statusText: 'Sessão alterada', url: request.url
  });

  return userService.ensureValidSession().pipe(
    switchMap(valid => {
      const credentials = userService.getSessionCredentials();
      if ((credentials?.identity ?? null) !== identity) {
        return throwError(sessionChanged);
      }
      if (!valid && userService.hasRecoverableSession()) {
        return throwError(() => new HttpErrorResponse({
          status: 503, statusText: 'Renovação da sessão temporariamente indisponível',
          url: request.url
        }));
      }
      if (!credentials) return next(request);

      return next(authorized(credentials)).pipe(
        catchError((error: unknown) => {
          if (!(error instanceof HttpErrorResponse) || error.status !== 401) {
            return throwError(() => error);
          }

          const latest = userService.getSessionCredentials();
          if (!latest || latest.identity !== credentials.identity) return throwError(() => error);

          // Another request or tab may have already refreshed.
          if (latest.accessToken !== credentials.accessToken) return next(authorized(latest));

          return userService.refreshToken(credentials.identity).pipe(
            switchMap(refreshed => {
              const fresh = userService.getSessionCredentials();
              return refreshed && fresh && fresh.identity === credentials.identity
                ? next(authorized(fresh))
                : throwError(() => error);
            })
          );
        })
      );
    })
  );
};

function parsedUrl(url: string): URL | null {
  try {
    return new URL(url, typeof window === 'undefined' ? 'http://localhost' : window.location.origin);
  } catch {
    return null;
  }
}

function isApiRequest(url: string): boolean {
  const requested = parsedUrl(url);
  const api = parsedUrl(environment.apiBaseUrl);
  if (!requested || !api || requested.origin !== api.origin) return false;
  const rootPath = api.pathname.replace(/\/$/, '');
  return !rootPath || requested.pathname === rootPath || requested.pathname.startsWith(rootPath + '/');
}

function isPublicRequest(url: string): boolean {
  const requested = parsedUrl(url);
  return Boolean(requested && (
    requested.pathname.startsWith('/public') || requested.pathname === '/meta/locales'
  ));
}

function isAuthRequest(url: string): boolean {
  const requested = parsedUrl(url);
  return Boolean(requested && requested.pathname.startsWith('/auth/'));
}
