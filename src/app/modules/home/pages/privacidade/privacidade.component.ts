import { Component, OnInit } from '@angular/core';
import { SeoService } from '../../../../core/services/seo-service.service';

@Component({
  selector: 'app-privacidade',
  standalone: false,
  templateUrl: './privacidade.component.html',
  styleUrl: './privacidade.component.scss'
})
export class PrivacidadeComponent implements OnInit {
  constructor(private readonly seoService: SeoService) { }

  ngOnInit(): void {
    this.seoService.updateMetaTags(
      'Pol\u00edtica de Privacidade - BraFurries',
      'Veja como a BraFurries coleta, utiliza e protege informacoes dos usuarios em seus servicos e canais digitais.'
    );
  }
}
