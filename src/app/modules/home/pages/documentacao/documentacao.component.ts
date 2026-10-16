import { Component, HostListener, OnInit } from '@angular/core';
import { SeoService } from '../../../../core/services/seo-service.service';

@Component({
  selector: 'app-documentacao',
  standalone: false,
  templateUrl: './documentacao.component.html',
  styleUrl: './documentacao.component.scss'
})
export class DocumentacaoComponent implements OnInit {
  drawerOpen: boolean = false;
  isScrolled = false;
  readonly scrollThreshold = 100;

  constructor(private readonly seoService: SeoService) { }

  ngOnInit(): void {
    this.seoService.updateMetaTags(
      'Documentação do Coddy — BraFurries',
      'Consulte a documentacao do Coddy, o bot da BraFurries, com recursos e orientacoes para servidores da comunidade.'
    );
  }

  @HostListener('window:scroll', [])
  onWindowScroll() {
    this.isScrolled = window.scrollY > this.scrollThreshold;
  }
}
