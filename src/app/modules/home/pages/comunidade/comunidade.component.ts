import { Component, OnInit } from '@angular/core';
import { SeoService } from '../../../../core/services/seo-service.service';

@Component({ selector: 'app-comunidade', standalone: false, templateUrl: './comunidade.component.html' })
export class ComunidadeComponent implements OnInit {
  constructor(private readonly seoService: SeoService) {}
  ngOnInit(): void { this.seoService.updateMetaTags('Comunidade Furry Brasileira — BraFurries', 'Conheça a comunidade furry brasileira BraFurries: convivência, Discord, atividades, projetos e um espaço para participar.'); }
}
