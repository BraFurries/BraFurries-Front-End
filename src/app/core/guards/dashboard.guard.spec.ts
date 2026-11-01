import { TestBed } from '@angular/core/testing';
import { Route, Router, UrlSegment, UrlTree } from '@angular/router';
import { firstValueFrom, of } from 'rxjs';
import { UserService } from '../services/user.service';
import { DashboardGuard } from './dashboard.guard';

describe('DashboardGuard', () => {
  let guard: DashboardGuard;
  let router: jasmine.SpyObj<Router>;
  let userService: jasmine.SpyObj<UserService>;

  beforeEach(() => {
    router = jasmine.createSpyObj<Router>('Router', ['createUrlTree']);
    userService = jasmine.createSpyObj<UserService>('UserService', ['ensureValidSession', 'hasRecoverableSession']);
    userService.hasRecoverableSession.and.returnValue(false);
    TestBed.configureTestingModule({
      providers: [DashboardGuard, { provide: Router, useValue: router }, { provide: UserService, useValue: userService }]
    });
    guard = TestBed.inject(DashboardGuard);
  });

  it('redirects an authenticated visitor away from public-only routes', async () => {
    const panelTree = {} as UrlTree;
    router.createUrlTree.and.returnValue(panelTree);
    userService.ensureValidSession.and.returnValue(of(true));

    const result = await firstValueFrom(guard.canLoad({ data: { guardMode: 'publicOnly' } }, []));

    expect(result).toBe(panelTree);
    expect(router.createUrlTree).toHaveBeenCalledWith(['/painel']);
  });

  it('keeps a guarded route while token refresh is temporarily unavailable', async () => {
    userService.ensureValidSession.and.returnValue(of(false));
    userService.hasRecoverableSession.and.returnValue(true);
    const result = await firstValueFrom(guard.canLoad({
      data: { guardMode: 'authenticatedOnly' }
    }, [new UrlSegment('painel', {}), new UrlSegment('comunidades', {})]));

    expect(result).toBeTrue();
    expect(router.createUrlTree).not.toHaveBeenCalled();
  });

  it('redirects to login after refresh revocation, preserving the requested route', async () => {
    userService.ensureValidSession.and.returnValue(of(false));
    userService.hasRecoverableSession.and.returnValue(false);
    const loginTree = {} as UrlTree;
    router.createUrlTree.and.returnValue(loginTree);

    const result = await firstValueFrom(guard.canLoad({
      data: { guardMode: 'authenticatedOnly' }
    }, [new UrlSegment('painel', {}), new UrlSegment('comunidades', {}),
        new UrlSegment('42', {}), new UrlSegment('coddy', {})]));

    expect(result).toBe(loginTree);
    expect(router.createUrlTree).toHaveBeenCalledWith(['/login'], {
      queryParams: { returnUrl: '/painel/comunidades/42/coddy' }
    });
  });

  it('redirects an unauthenticated visitor to login with the requested path', async () => {
    const loginTree = {} as UrlTree;
    router.createUrlTree.and.returnValue(loginTree);
    userService.ensureValidSession.and.returnValue(of(false));
    const route: Route = { data: { guardMode: 'authenticatedOnly' } };

    const result = await firstValueFrom(guard.canLoad(route, [new UrlSegment('painel', {})]));

    expect(result).toBe(loginTree);
    expect(router.createUrlTree).toHaveBeenCalledWith(['/login'], { queryParams: { returnUrl: '/painel' } });
  });
});
