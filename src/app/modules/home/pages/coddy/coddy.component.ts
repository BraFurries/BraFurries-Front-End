import { Component, OnInit } from '@angular/core';
import { SeoService } from '../../../../core/services/seo-service.service';

@Component({ selector: 'app-coddy', standalone: false, templateUrl: './coddy.component.html' })
export class CoddyComponent implements OnInit {
  constructor(private readonly seoService: SeoService) {}
  ngOnInit(): void { this.seoService.updateMetaTags('Coddy — Bot para gerenciamento de comunidades', 'Conheça o Coddy, o bot da BraFurries para ajudar no gerenciamento e na participação de comunidades no Discord.'); }
}
