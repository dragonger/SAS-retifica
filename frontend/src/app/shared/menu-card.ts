import { Component, inject, input } from '@angular/core';
import { Router } from '@angular/router';

/** Cartão do menu do Catálogo (menuCard do app.js). O ícone vem como conteúdo. */
@Component({
  selector: 'app-menu-card',
  host: { style: 'display: contents' },
  template: `
    <div [class]="'menu-card elev-md blueprint menu-card-' + variante()" (click)="abrir()">
      <i class="corner tl"></i><i class="corner tr"></i><i class="corner bl"></i><i class="corner br"></i>
      <div class="menu-card-esq">
        <div class="menu-card-icone"><ng-content /></div>
        <span class="menu-card-titulo">{{ nome() }}</span>
      </div>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18l6-6-6-6"></path></svg>
    </div>
  `,
})
export class MenuCard {
  private readonly router = inject(Router);

  readonly nome = input.required<string>();
  readonly variante = input.required<'accent' | 'neutral' | 'accent-2'>();
  /** Rota de destino (ex.: "/clientes"). */
  readonly rota = input.required<string>();

  protected abrir(): void {
    void this.router.navigateByUrl(this.rota());
  }
}
