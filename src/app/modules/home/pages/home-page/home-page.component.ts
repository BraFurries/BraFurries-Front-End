import { Component, OnInit } from '@angular/core';
import { SeoService } from '../../../../core/services/seo-service.service';

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

  constructor(private readonly seoService: SeoService) { }

  ngOnInit() {
    this.seoService.updateMetaTags(
      'BraFurries — Comunidade Furry Brasileira',
      'Conheca a BraFurries, uma das maiores comunidades furry brasileiras para conversar, participar de eventos, fazer amizades e acompanhar novidades do fandom.'
    );
  }
}
