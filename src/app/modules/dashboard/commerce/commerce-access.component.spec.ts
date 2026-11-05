import { CommonModule } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { PlatformAccessService } from '../../../core/services/platform-access.service';
import { CommerceAccessComponent } from './commerce-access.component';

describe('CommerceAccessComponent (legacy commercial landing)', () => {
  let fixture: ComponentFixture<CommerceAccessComponent>;
  let service: jasmine.SpyObj<PlatformAccessService>;
  let router: jasmine.SpyObj<Router>;

  async function open(enabled: boolean, owner: boolean, permissions: string[]): Promise<void> {
    service = jasmine.createSpyObj('PlatformAccessService', ['myAccess']);
    router = jasmine.createSpyObj('Router', ['navigateByUrl']);
    router.navigateByUrl.and.returnValue(Promise.resolve(true));
    service.myAccess.and.returnValue(of({ enabled, owner, permissions }));
    await TestBed.configureTestingModule({
      declarations: [CommerceAccessComponent],
      imports: [CommonModule],
      providers: [
        { provide: PlatformAccessService, useValue: service },
        { provide: Router, useValue: router }
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(CommerceAccessComponent);
    fixture.detectChanges();
  }

  afterEach(() => fixture?.destroy());

  it('routes the owner directly to operational catalog, not a permissions page', async () => {
    await open(true, true, []);
    expect(router.navigateByUrl).toHaveBeenCalledWith(
      '/painel/gestao-comercial/catalogo', { replaceUrl: true });
    expect(fixture.nativeElement.textContent).not.toContain('Gerenciar permissões administrativas');
  });

  it('sends finance-only delegates directly to finance, not the denied catalog', async () => {
    await open(true, false, ['FINANCE_VIEW']);
    expect(router.navigateByUrl).toHaveBeenCalledWith(
      '/painel/gestao-comercial/financeiro', { replaceUrl: true });
  });

  it('preserves catalog access for delegates with commercial product permissions', async () => {
    await open(true, false, ['PRODUCTS_MANAGE']);
    expect(router.navigateByUrl).toHaveBeenCalledWith(
      '/painel/gestao-comercial/catalogo', { replaceUrl: true });
  });

  it('does not grant commerce access based only on partner rights', async () => {
    await open(true, false, ['PARTNERS_MANAGE']);
    expect(router.navigateByUrl).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('não possui permissão');
  });

  it('shows a safe message when platform access is disabled', async () => {
    await open(false, false, []);
    expect(router.navigateByUrl).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('indisponível');
  });

  it('does not navigate when the access API fails', async () => {
    await open(true, false, []);
    fixture.destroy();
    service.myAccess.and.returnValue(throwError(() => new Error('network')));
    fixture = TestBed.createComponent(CommerceAccessComponent);
    fixture.detectChanges();
    expect(router.navigateByUrl).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Não foi possível consultar');
  });
});
