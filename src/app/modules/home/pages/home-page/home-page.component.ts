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
    private readonly publicPartners: PublicPartnersService
  ) { }

  trackPartner(_index: number, partner: PublicPartner): number { return partner.id; }

  ngOnInit() {
    this.seoService.updateMetaTags(
      'BraFurries — Comunidade Furry Brasileira',
      'Conheca a BraFurries, uma das maiores comunidades furry brasileiras para conversar, participar de eventos, fazer amizades e acompanhar novidades do fandom.'
    );

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
