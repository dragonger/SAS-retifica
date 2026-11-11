import { Component, computed, input } from '@angular/core';
import { moeda } from '../../shared/formatacao';
import { ItemAgregado } from '../encerrados/encerrados';

/**
 * Bloco reaproveitado pra "valor por cliente" e "por categoria" (blocoAgregado
 * do app.js): barras horizontais + subtotal — mesma lógica pros dois.
 */
@Component({
  selector: 'app-bloco-agregado',
  host: { style: 'display: block; margin-top: 20px' },
  template: `
    @if (!itens()?.length) {
      <div class="empty">Sem dados.</div>
    } @else {
      <div class="bar-list">
        @for (i of itens()!; track $index) {
          <div class="bar-row">
            <div class="bar-row-top">
              <span class="bar-label">{{ i.descricao }}</span>
              <span class="bar-value">{{ moeda(i.total) }}</span>
            </div>
            <div class="bar-track">
              <div class="bar-fill" [style.width.%]="largura(i)"></div>
            </div>
          </div>
        }
      </div>
      <div class="total-box">
        <span>{{ tituloTotal() }}</span>
        <span class="valor">{{ moeda(totalGeral()) }}</span>
      </div>
    }
  `,
})
export class BlocoAgregado {
  readonly itens = input.required<ItemAgregado[] | null | undefined>();
  readonly totalGeral = input.required<number | string>();
  readonly tituloTotal = input.required<string>();

  protected readonly moeda = moeda;
  private readonly maior = computed(() => Math.max(...(this.itens() ?? []).map(i => Number(i.total))));

  protected largura(i: ItemAgregado): number {
    const maior = this.maior();
    return maior > 0 ? Number(i.total) / maior * 100 : 0;
  }
}
