import { Component, OnInit } from '@angular/core';
import { SeoService } from '../../../../core/services/seo-service.service';

@Component({
  selector: 'app-tos',
  standalone: false,
  templateUrl: './tos.component.html',
  styleUrl: './tos.component.scss'
})
export class TOSComponent implements OnInit {
  constructor(private readonly seoService: SeoService) { }

  ngOnInit(): void {
    this.seoService.updateMetaTags(
      'Termos de Servi\u00e7o - BraFurries',
      'Consulte os termos de servico da BraFurries e entenda as regras de uso da plataforma e dos recursos da comunidade.'
    );
  }
}
