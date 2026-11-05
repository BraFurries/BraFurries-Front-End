import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import {
  PlatformAccessService
} from './platform-access.service';

describe('PlatformAccessService', () => {
  let service: PlatformAccessService;
  let http: HttpTestingController;
  const base = `${environment.apiBaseUrl}/user/me/platform-access`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), PlatformAccessService]
    });
    service = TestBed.inject(PlatformAccessService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('requests access from the private BraFurries API, not Community capabilities', () => {
    let allowed = false;
    service.myAccess().subscribe(response => allowed = response.enabled && response.owner);

    const request = http.expectOne(`${base}/me`);
    expect(request.request.method).toBe('GET');
    request.flush({ enabled: true, owner: true, permissions: [] });
    expect(allowed).toBeTrue();
  });

  it('allows owner-controlled personal approvals and independent role grants', () => {
    service.approve(11).subscribe();
    const approve = http.expectOne(`${base}/people/11`);
    expect(approve.request.method).toBe('PUT');
    approve.flush(null);

    service.personPermission(11, 'PRODUCTS_MANAGE', true).subscribe();
    const individual = http.expectOne(`${base}/people/11/permissions/PRODUCTS_MANAGE`);
    expect(individual.request.method).toBe('PUT');
    individual.flush(null);

    service.rolePermission(25, 'PRODUCTS_MANAGE', false).subscribe();
    const role = http.expectOne(`${base}/team-roles/25/permissions/PRODUCTS_MANAGE`);
    expect(role.request.method).toBe('DELETE');
    role.flush(null);
  });

  it('reads the live platform permission catalog instead of hardcoding module access', () => {
    let definitions: Array<{ code: string; area: string }> = [];
    service.permissionCatalog().subscribe(items => definitions = items);
    const request = http.expectOne(`${base}/permissions`);
    expect(request.request.method).toBe('GET');
    request.flush([{ code: 'PARTNERS_MANAGE', area: 'PARTNERS', label: 'Gerenciar parceiros', description: '' }]);
    expect(definitions[0].area).toBe('PARTNERS');
  });
});
