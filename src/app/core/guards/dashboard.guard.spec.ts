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
    userService = jasmine.createSpyObj<UserService>('UserService', ['ensureValidSession']);
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
