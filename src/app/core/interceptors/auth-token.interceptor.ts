import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { UserService } from '../services/user.service';

export const authTokenInterceptor: HttpInterceptorFn = (request, next) => {
  const userService = inject(UserService);
  const token = userService.getAccessToken();
  const tokenType = userService.getTokenType();

  if (!token || isPublicRequest(request.url)) {
    return next(request);
  }

  const authenticatedRequest = request.clone({
    setHeaders: {
      Authorization: `${tokenType} ${token}`
    }
  });

  return next(authenticatedRequest);
};

function isPublicRequest(url: string): boolean {
  try {
    const parsedUrl = new URL(url, window.location.origin);

    return parsedUrl.pathname.startsWith('/public') || parsedUrl.pathname === '/meta/locales';
  } catch {
    return url.startsWith('/public') || url.endsWith('/meta/locales');
  }
}
