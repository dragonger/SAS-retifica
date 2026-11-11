import { Component, computed, input, output } from '@angular/core';
import { moeda, textoQuantidade } from './formatacao';

/** Cartão "Você deve ao Daniel" — grande na tela própria, menor no Início (toque abre a tela). */
@Component({
  selector: 'app-cartao-devido-ao-daniel',
  host: { style: 'display: contents' },
  template: `
    <div class="card-destaque elev-md blueprint" [style]="estilo()" (click)="tocar.emit()">
      <i class="corner tl"></i><i class="corner tr"></i><i class="corner bl"></i><i class="corner br"></i>
      <div class="card-destaque-titulo" style="margin-bottom:4px">Você deve ao Daniel</div>
      <div [style]="'font-size:' + (grande() ? '30px' : '24px') + ';font-weight:700;line-height:1.1'">{{ moedaValor() }}</div>
      <div style="font-size:12px;opacity:.65;margin-top:4px">{{ detalhe() }}</div>
      @if (linhaExtra()) {
        <div style="font-size:12px;margin-top:6px;padding-top:6px;border-top:1px solid color-mix(in srgb, var(--color-text) 14%, transparent)">{{ linhaExtra() }}</div>
      }
    </div>
  `,
})
export class CartaoDevidoAoDaniel {
  readonly valor = input.required<number | string>();
  readonly quantidade = input.required<number>();
  readonly grande = input(false);
  /** Com toque (Início): cursor de clique e "toque para conferir". */
  readonly tocavel = input(false);
  readonly linhaExtra = input<string | null>(null);
  readonly tocar = output<void>();

  protected readonly moedaValor = computed(() => moeda(this.valor()));
  protected readonly estilo = computed(() =>
    'padding:' + (this.grande() ? '18px' : '14px') + (this.tocavel() ? ';cursor:pointer' : ''));
  protected readonly detalhe = computed(() =>
    textoQuantidade(this.quantidade()) + ' que o cliente já pagou' + (this.tocavel() ? ' · toque para conferir' : ''));
}
