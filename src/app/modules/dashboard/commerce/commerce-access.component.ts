import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { PlatformAccessService } from '../../../core/services/platform-access.service';

/**
 * Backward-compatible landing route. Commerce is operational (catalog / finance);
 * administrative grants live only at /painel/admin/permissoes.
 */
@Component({
  selector: 'app-commerce-access',
  standalone: false,
  templateUrl: './commerce-access.component.html'
})
export class CommerceAccessComponent implements OnInit, OnDestroy {
  loading = true;
  errorMessage = '';
  private readonly destroy$ = new Subject<void>();

  private readonly catalogPermissions = new Set([
    'ARTWORKS_MANAGE', 'CONTRACTS_MANAGE', 'SUPPLIERS_MANAGE', 'PRODUCTS_MANAGE'
  ]);
  private readonly financePermissions = new Set([
    'SALES_MANAGE', 'FINANCE_VIEW', 'SETTLEMENTS_MANAGE',
    'PAYMENTS_RECORD', 'CASHFLOW_MANAGE'
  ]);

  constructor(
    private readonly access: PlatformAccessService,
    private readonly router: Router
  ) {}

  ngOnInit(): void {
    this.access.myAccess().pipe(takeUntil(this.destroy$)).subscribe({
      next: rights => {
        if (!rights.enabled) {
          this.errorMessage = 'A Gestão Comercial está indisponível no momento.';
          this.loading = false;
          return;
        }
        const catalog = rights.owner || rights.permissions.some(p => this.catalogPermissions.has(p));
        const finance = rights.owner || rights.permissions.some(p => this.financePermissions.has(p));
        if (!catalog && !finance) {
          this.errorMessage = 'Sua conta não possui permissão para acessar a Gestão Comercial.';
          this.loading = false;
          return;
        }
        // Keep existing bookmarked /painel/gestao-comercial links working.
        // Prefer Financeiro for operators with both grants. Catalog-only users retain access.
        void this.router.navigateByUrl(
          finance ? '/painel/gestao-comercial/financeiro' : '/painel/gestao-comercial/catalogo',
          { replaceUrl: true }
        ).then(navigated => {
          if (!navigated) {
            this.errorMessage = 'Não foi possível abrir a Gestão Comercial.';
            this.loading = false;
          }
        }).catch(() => {
          this.errorMessage = 'Não foi possível abrir a Gestão Comercial.';
          this.loading = false;
        });
      },
      error: () => {
        this.errorMessage = 'Não foi possível consultar sua autorização comercial.';
        this.loading = false;
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
