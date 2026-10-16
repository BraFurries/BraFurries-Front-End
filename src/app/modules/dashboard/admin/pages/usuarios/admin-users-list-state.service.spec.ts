import { NavigationEnd, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { AdminUsersListStateService } from './admin-users-list-state.service';

describe('AdminUsersListStateService', () => {
  let routerEvents: Subject<NavigationEnd>;
  let service: AdminUsersListStateService;

  beforeEach(() => {
    window.sessionStorage.clear();
    routerEvents = new Subject<NavigationEnd>();
    service = new AdminUsersListStateService({
      events: routerEvents.asObservable()
    } as Router);
  });

  afterEach(() => {
    window.sessionStorage.clear();
    routerEvents.complete();
  });

  it('restores search, filters and pagination from the current tab session', () => {
    service.save({
      search: 'nick',
      status: 'active',
      role: 'member',
      page: 4,
      pageSize: 20
    });

    expect(service.restore()).toEqual({
      search: 'nick',
      status: 'active',
      role: 'member',
      page: 4,
      pageSize: 20
    });
  });

  it('keeps list state while opening a profile and clears it after leaving user management', () => {
    service.save({
      search: 'nick',
      status: '',
      role: '',
      page: 2,
      pageSize: 20
    });

    routerEvents.next(new NavigationEnd(
      1,
      '/painel/admin/usuarios/42',
      '/painel/admin/usuarios/42'
    ));

    expect(service.restore()?.page).toBe(2);

    routerEvents.next(new NavigationEnd(
      2,
      '/painel/admin/metricas',
      '/painel/admin/metricas'
    ));

    expect(service.restore()).toBeNull();
  });

  it('discards malformed persisted state instead of applying it', () => {
    window.sessionStorage.setItem(
      'brafurries.admin.users.list-state',
      JSON.stringify({ search: 'nick', status: 'muted', role: '', page: -1, pageSize: 20 })
    );

    expect(service.restore()).toBeNull();
  });
});
