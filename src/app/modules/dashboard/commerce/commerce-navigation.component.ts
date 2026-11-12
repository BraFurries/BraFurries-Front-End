import { Component, Input } from '@angular/core';

/** Single source of truth for the two permanent commercial section links. */
@Component({
  selector: 'app-commerce-navigation',
  standalone: false,
  template: `
    <header>
      <p class="text-xs font-bold uppercase tracking-widest text-braPurple">
        Gestão interna · somente BraFurries
      </p>
      <h1 class="mt-2 font-amaranth text-3xl font-bold text-braDark">Gestão Comercial</h1>
      <p class="mt-2 max-w-3xl text-sm text-gray-600">
        Gerencie o financeiro, artes, arquivos, contratos, fornecedores e produtos
        em um único ambiente, separado da economia virtual do Discord.
      </p>
      <nav class="mt-4 flex flex-wrap gap-2" aria-label="Áreas da Gestão Comercial">
        <a routerLink="/painel/gestao-comercial/financeiro"
          [attr.aria-current]="active === 'financeiro' ? 'page' : null"
          [ngClass]="active === 'financeiro' ? 'bg-braPurple text-white' : 'border border-purple-100 bg-white text-braPurple hover:bg-purple-50'"
          class="rounded-lg px-4 py-2 text-sm font-bold transition">
          Financeiro
        </a>
        <a routerLink="/painel/gestao-comercial/catalogo"
          [attr.aria-current]="active === 'catalogo' ? 'page' : null"
          [ngClass]="active === 'catalogo' ? 'bg-braPurple text-white' : 'border border-purple-100 bg-white text-braPurple hover:bg-purple-50'"
          class="rounded-lg px-4 py-2 text-sm font-bold transition">
          Cadastros
        </a>
      </nav>
    </header>
  `
})
export class CommerceNavigationComponent {
  @Input() active: 'financeiro' | 'catalogo' = 'financeiro';
}
