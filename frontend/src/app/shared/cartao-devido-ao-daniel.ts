import { Component, computed, input, output } from '@angular/core';
import { moeda, textoQuantidade } from './formatacao';

/** Cartão "Você deve ao Daniel" — grande na tela própria, menor no Início (toque abre a tela). */
@Component({
  selector: 'app-cartao-devido-ao-daniel',
  host: { style: 'display: contents' },
  template: `
    <div class="card-destaque elev-md blueprint" [class]="'card-devido ' + (grande() ? 'card-devido-grande' : 'card-devido-pequeno') + (tocavel() ? ' card-devido-tocavel' : '')" (click)="tocar.emit()">
      <i class="corner tl"></i><i class="corner tr"></i><i class="corner bl"></i><i class="corner br"></i>
      <div class="card-destaque-titulo card-devido-titulo">Você deve ao Daniel</div>
      <div class="card-devido-valor">{{ moedaValor() }}</div>
      <div class="card-devido-detalhe">{{ detalhe() }}</div>
      @if (linhaExtra()) {
        <div class="card-devido-extra">{{ linhaExtra() }}</div>
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
  protected readonly detalhe = computed(() =>
    textoQuantidade(this.quantidade()) + ' que o cliente já pagou' + (this.tocavel() ? '. Toque para conferir' : ''));
}
