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

  const authorized = (token: string): HttpRequest<unknown> => request.clone({
    setHeaders: { Authorization: `${userService.getTokenType()} ${token}` }
  });

  return userService.ensureValidSession().pipe(
    switchMap(valid => {
      if (!valid && userService.hasRecoverableSession()) {
        // API/network failure is not revocation. Keep the session and URL;
        // protected requests can be retried when connectivity recovers.
        return throwError(() => new HttpErrorResponse({
          status: 503, statusText: 'Renovação da sessão temporariamente indisponível',
          url: request.url
        }));
      }

      const token = userService.getAccessToken();
      if (!token) return next(request);

      return next(authorized(token)).pipe(
        catchError((error: unknown) => {
          if (!(error instanceof HttpErrorResponse) || error.status !== 401) {
            return throwError(() => error);
          }

          // Another request may already have refreshed while this one was
          // in transit; reuse the newest token instead of rotating it again.
          const newerToken = userService.getAccessToken();
          if (newerToken && newerToken !== token) return next(authorized(newerToken));

          return userService.refreshToken().pipe(
            switchMap(refreshed => {
              const freshToken = userService.getAccessToken();
              return refreshed && freshToken
                ? next(authorized(freshToken))
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
