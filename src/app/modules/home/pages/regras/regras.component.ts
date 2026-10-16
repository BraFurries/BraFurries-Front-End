import { Component, OnInit } from '@angular/core';
import { SeoService } from '../../../../core/services/seo-service.service';

@Component({
  selector: 'app-regras',
  standalone: false,
  templateUrl: './regras.component.html',
  styleUrl: './regras.component.scss'
})
export class RegrasComponent implements OnInit {
  constructor(private readonly seoService: SeoService) { }

  ngOnInit(): void {
    this.seoService.updateMetaTags(
      'Regras - BraFurries',
      'Conheca as regras da BraFurries para convivencia, participacao em canais da comunidade e organizacao de eventos.'
    );
  }
}
