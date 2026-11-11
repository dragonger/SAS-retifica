import { Component, computed, input } from '@angular/core';
import { CLASSE_SITUACAO } from './linha-pedido';

/** Selo de situação do pedido (tagSituacao do app.js): Aberto, Em andamento, Pronto, Atrasado, Finalizado. */
@Component({
  selector: 'app-tag-situacao',
  host: { style: 'display: contents' },
  template: `<span [class]="'tag ' + classe()">@if (situacao() === 'Atrasado') {<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>}@if (situacao() === 'Finalizado') {<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6 9 17l-5-5"/></svg>}{{ situacao() }}</span>`,
})
export class TagSituacao {
  readonly situacao = input.required<string>();
  protected readonly classe = computed(() => CLASSE_SITUACAO[this.situacao()] || 'tag-neutral');
}
