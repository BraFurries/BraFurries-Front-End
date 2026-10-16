import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, CanLoad, Route, Router, UrlSegment, UrlTree } from '@angular/router';
import { Observable, map } from 'rxjs';
import { UserService } from '../services/user.service';

@Injectable({
  providedIn: 'root'
})
export class DashboardGuard implements CanActivate, CanLoad {
  constructor(
    private userService: UserService,
    private router: Router
  ) {}

  canActivate(route: ActivatedRouteSnapshot): Observable<boolean | UrlTree> {
    const returnUrl = `/${route.pathFromRoot
      .flatMap((snapshot) => snapshot.url)
      .map((segment) => segment.path)
      .join('/')}`;

    return this.authorizeAccess(route.data?.['guardMode'], returnUrl !== '/' ? returnUrl : undefined);
  }

  canLoad(route: Route, segments: UrlSegment[]): Observable<boolean | UrlTree> {
    const returnUrl = segments.length > 0 ? `/${segments.map((segment) => segment.path).join('/')}` : undefined;
    return this.authorizeAccess(route.data?.['guardMode'], returnUrl);
  }

  private authorizeAccess(
    guardMode: 'publicOnly' | 'authenticatedOnly' | undefined,
    returnUrl?: string
  ): Observable<boolean | UrlTree> {
    return this.userService.ensureValidSession().pipe(
      map((isValidSession) => {
        if (guardMode === 'publicOnly') {
          return isValidSession ? this.router.createUrlTree(['/painel']) : true;
        }

        if (isValidSession) {
          return true;
        }

        return this.router.createUrlTree(['/login'], {
          queryParams: returnUrl ? { returnUrl } : undefined
        });
      })
    );
  }
}
