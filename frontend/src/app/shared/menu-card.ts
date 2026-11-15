import { Component, inject, input } from '@angular/core';
import { Router } from '@angular/router';

/** Linha do grupo de menu do Catálogo (menuCard do app.js). O ícone, de traço, vem como conteúdo. */
@Component({
  selector: 'app-menu-card',
  host: { style: 'display: contents' },
  template: `
    <button type="button" class="menu-card linha-menu" (click)="abrir()">
      <span class="linha-menu-icone"><ng-content /></span>
      <span class="menu-card-titulo">{{ nome() }}</span>
      <svg class="linha-menu-seta" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6"></path></svg>
    </button>
  `,
})
export class MenuCard {
  private readonly router = inject(Router);

  readonly nome = input.required<string>();
  /** Rota de destino (ex.: "/clientes"). */
  readonly rota = input.required<string>();

  protected abrir(): void {
    void this.router.navigateByUrl(this.rota());
  }
}
