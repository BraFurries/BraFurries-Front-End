import { Component, OnInit } from '@angular/core';
import { SeoService } from '../../../../core/services/seo-service.service';

@Component({
  selector: 'app-sobre-nos',
  templateUrl: './sobre-nos.component.html',
  standalone: false,
  styleUrl: './sobre-nos.component.scss'
})
export class SobreNosComponent implements OnInit {
  constructor(private readonly seoService: SeoService) { }

  ngOnInit(): void {
    this.seoService.updateMetaTags(
      'Sobre a BraFurries — Nossa história e comunidade',
      'Saiba mais sobre a BraFurries, a comunidade furry brasileira, sua historia, proposito e espacos para o fandom no Brasil.'
    );
  }
}
