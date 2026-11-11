import { NgTemplateOutlet } from '@angular/common';
import { Component, TemplateRef, contentChild, input } from '@angular/core';

export interface GrupoCategoria<T> {
  rotulo: string;
  itens: T[];
}

/** Agrupa por `categoriaRotulo` (sem categoria = "Outro"), na ordem em que cada categoria aparece. */
export function agruparPorCategoria<T extends { categoriaRotulo?: string | null }>(catalogo: T[]): GrupoCategoria<T>[] {
  const mapa = new Map<string, T[]>();
  catalogo.forEach(item => {
    const chave = item.categoriaRotulo || 'Outro';
    if (!mapa.has(chave)) mapa.set(chave, []);
    mapa.get(chave)!.push(item);
  });
  return Array.from(mapa.entries()).map(([rotulo, itens]) => ({ rotulo, itens }));
}

/** Lista por categoria (.grupo-categoria + h3); o conteúdo de cada item vem do `<ng-template let-item>` filho. */
@Component({
  selector: 'app-lista-agrupada',
  imports: [NgTemplateOutlet],
  host: { style: 'display: contents' },
  template: `
    @for (g of grupos(); track g.rotulo) {
      <div class="grupo-categoria">
        <h3>{{ g.rotulo }}</h3>
        @for (item of g.itens; track $index) {
          <ng-container [ngTemplateOutlet]="modelo()" [ngTemplateOutletContext]="{ $implicit: item }" />
        }
      </div>
    }
  `,
})
export class ListaAgrupada<T> {
  readonly grupos = input.required<GrupoCategoria<T>[]>();
  protected readonly modelo = contentChild.required(TemplateRef);
}
