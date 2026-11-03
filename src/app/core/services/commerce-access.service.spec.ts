import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import {
  CommerceAccessService, COMMERCE_PERMISSIONS
} from './commerce-access.service';

describe('CommerceAccessService', () => {
  let service: CommerceAccessService;
  let http: HttpTestingController;
  const base = `${environment.apiBaseUrl}/user/me/brafurries-commerce/access`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), CommerceAccessService]
    });
    service = TestBed.inject(CommerceAccessService);
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

  it('exposes the eight distinct private permission codes', () => {
    expect(COMMERCE_PERMISSIONS.length).toBe(8);
    expect(new Set(COMMERCE_PERMISSIONS.map(permission => permission.code)).size).toBe(8);
    expect(COMMERCE_PERMISSIONS.some(permission => permission.code === 'PAYMENTS_RECORD')).toBeTrue();
  });
});
