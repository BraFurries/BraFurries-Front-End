import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subject, forkJoin, takeUntil } from 'rxjs';
import {
  ArtistClaim, ArtistPortfolio, CommerceArtistService
} from '../../../core/services/commerce-artist.service';

/** Personal, owner-scoped view. Never requests a user id or management grants. */
@Component({
  selector: 'app-commerce-artist-portal',
  standalone: false,
  templateUrl: './commerce-artist-portal.component.html'
})
export class CommerceArtistPortalComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  readonly currentYear = Number(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', year: 'numeric'
  }).format(new Date()));
  readonly currentMonth = Number(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', month: 'numeric'
  }).format(new Date()));

  year = this.currentYear;
  month = this.currentMonth;
  loading = true;
  saving = false;
  errorMessage = '';
  successMessage = '';
  portfolio: ArtistPortfolio | null = null;
  claims: ArtistClaim[] = [];
  claimArtistId: number | null = null;
  claimMessage = '';

  constructor(private readonly artists: CommerceArtistService) {}

  ngOnInit(): void {
    this.reload();
  }

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
    forkJoin({
      portfolio: this.artists.portfolio(this.year, this.month),
      claims: this.artists.myClaims()
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: ({ portfolio, claims }) => {
        this.portfolio = portfolio;
        this.claims = claims;
        this.loading = false;
      },
      error: () => {
        this.errorMessage = 'Não foi possível carregar seu extrato de artista. Tente novamente.';
        this.loading = false;
      }
    });
  }

  requestClaim(): void {
    if (this.saving || this.claimArtistId === null ||
        !Number.isInteger(this.claimArtistId) || this.claimArtistId <= 0) {
      this.errorMessage = 'Informe o ID do artista fornecido pela equipe.';
      return;
    }
    this.saving = true;
    this.errorMessage = '';
    this.successMessage = '';
    this.artists.requestClaim(this.claimArtistId, this.claimMessage)
      .pipe(takeUntil(this.destroy$)).subscribe({
        next: () => {
          this.saving = false;
          this.claimArtistId = null;
          this.claimMessage = '';
          this.successMessage = 'Reivindicação registrada. A equipe verificará sua identidade por um canal independente.';
          this.reload();
        },
        error: error => {
          this.saving = false;
          this.errorMessage = error?.status === 409
            ? 'Já existe uma reivindicação pendente ou este cadastro está vinculado. Entre em contato com a equipe.'
            : 'Não foi possível enviar a reivindicação.';
        }
      });
  }
}
