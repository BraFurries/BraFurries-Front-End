import { Component, OnInit } from '@angular/core';
import { SeoService } from '../../../../core/services/seo-service.service';

@Component({
  selector: 'app-contestacao',
  standalone: false,
  templateUrl: './contestacao.component.html',
  styleUrl: './contestacao.component.scss'
})
export class ContestacaoComponent implements OnInit {
  constructor(private readonly seoService: SeoService) { }

  ngOnInit(): void {
    this.seoService.updateMetaTags(
      'Contesta\u00e7\u00e3o - BraFurries',
      'Acesse as orientacoes para contestar decisoes, enviar solicitacoes e acompanhar procedimentos da BraFurries.'
    );
  }
}
