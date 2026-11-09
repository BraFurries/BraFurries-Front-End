import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { ArtistPortfolio, CommerceArtistService } from '../../../core/services/commerce-artist.service';

/**
 * Private read-only portfolio for the canonical authenticated account.
 * Ownership is established through an administrator-issued invitation.
 */
@Component({
  selector: 'app-commerce-artist-portal',
  standalone: false,
  templateUrl: './commerce-artist-portal.component.html'
})
export class CommerceArtistPortalComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  readonly currentYear = Number(new Intl.DateTimeFormat('en-US', {
    timeZone:'America/Sao_Paulo', year:'numeric'
  }).format(new Date()));
  readonly currentMonth = Number(new Intl.DateTimeFormat('en-US', {
    timeZone:'America/Sao_Paulo', month:'numeric'
  }).format(new Date()));

  year = this.currentYear;
  month = this.currentMonth;
  loading = true;
  errorMessage = '';
  portfolio: ArtistPortfolio | null = null;

  constructor(private readonly artists: CommerceArtistService) {}

  ngOnInit(): void { this.reload(); }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  reload(): void {
    if (!Number.isInteger(this.year) || this.year < 2000 || this.year > 2200 ||
        !Number.isInteger(this.month) || this.month < 1 || this.month > 12) {
      this.errorMessage = 'Informe um ano e mês válidos.';
      return;
    }
    this.errorMessage = '';
    this.loading = true;
    this.artists.portfolio(this.year,this.month)
      .pipe(takeUntil(this.destroy$)).subscribe({
        next: portfolio => {
          this.portfolio = portfolio;
          this.loading = false;
        },
        error: () => {
          this.loading = false;
          this.portfolio = null;
          this.errorMessage = 'Não foi possível carregar seu extrato de artista. Tente novamente.';
        }
      });
  }
}
