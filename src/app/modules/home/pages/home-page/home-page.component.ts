import { isPlatformBrowser } from '@angular/common';
import { Inject, PLATFORM_ID } from '@angular/core';
import { Component, OnInit } from '@angular/core';
import { SeoService } from '../../../../core/services/seo-service.service';
import { PublicPartner, PublicPartnersService } from '../../../../core/services/public-partners.service';

@Component({
  selector: 'app-home-page',
  templateUrl: './home-page.component.html',
  standalone: false,
  styleUrl: './home-page.component.scss'
})
export class HomePageComponent implements OnInit {
  linkRedes = {
    facebook: 'https://www.facebook.com/groups/brafurries/',
    discord: 'https://discord.gg/brafurries',
    telegram: 'https://t.me/brafurros',
  }

  partners: PublicPartner[] = [];
  partnersLoading = true;
  partnersError = false;

  constructor(
    private readonly seoService: SeoService,
    private readonly publicPartners: PublicPartnersService,
    @Inject(PLATFORM_ID) private readonly platformId: object
  ) { }

  trackPartner(_index: number, partner: PublicPartner): number { return partner.id; }

  ngOnInit() {
    this.seoService.updateMetaTags(
      'BraFurries — Comunidade Furry Brasileira',
      'Conheca a BraFurries, uma das maiores comunidades furry brasileiras para conversar, participar de eventos, fazer amizades e acompanhar novidades do fandom.'
    );

    // The public homepage is prerendered in CI/SSR. Do not block static
    // generation on an external API request; the browser loads live partners.
    if (!isPlatformBrowser(this.platformId)) {
      // Preserve the same initial loading DOM for SSR hydration.
      return;
    }
    this.publicPartners.getActive().subscribe({
      next: partners => {
        this.partners = partners;
        this.partnersLoading = false;
        this.partnersError = false;
      },
      error: () => {
        this.partners = [];
        this.partnersLoading = false;
        this.partnersError = true;
      }
    });
  }
}
