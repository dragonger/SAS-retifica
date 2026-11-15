import { Component, inject, signal } from '@angular/core';
import { ModeloEntrada } from '../../shared/entradas';
import { valorDe } from '../../shared/evento';
import { moeda } from '../../shared/formatacao';
import { EstadoPedidoForm } from './estado-pedido-form';
import { SeletorItens } from './seletor-itens';

/**
 * Etapa "Itens": alternador Serviços/Peças e a seção de valores (subtotal e desconto); o total fica na barra de ações fixa. Tudo recalculado ao vivo
 * pela mesma fórmula do backend (shared/totais-pedido).
 */
@Component({
  selector: 'app-aba-itens',
  imports: [SeletorItens, ModeloEntrada],
  host: { style: 'display: contents' },
  template: `
    <div class="seg">
      <button type="button" [class.active]="tipo() === 'servico'" (click)="tipo.set('servico')">Serviços</button>
      <button type="button" [class.active]="tipo() === 'peca'" (click)="tipo.set('peca')">Peças</button>
    </div>
    <!-- os dois seletores ficam montados (só alternam o hidden), para não perder o que foi marcado -->
    <div class="pilha pilha-12" [hidden]="tipo() !== 'servico'">
      <app-seletor-itens tipo="servicos" rotuloNovo="Novo serviço" singular="serviço" endpoint="/api/servicos-catalogo" />
    </div>
    <div class="pilha pilha-12" [hidden]="tipo() !== 'peca'">
      <app-seletor-itens tipo="pecas" [comQuantidade]="true" rotuloNovo="Nova peça" singular="peça" [feminino]="true" endpoint="/api/pecas-catalogo" />
    </div>

    <section class="valores-form" aria-label="Valores">
      <h3 class="secao">Valores</h3>
      <div class="valores-linha">
        <span>Subtotal</span><span>{{ moeda(estado.totais().subtotal) }}</span>
      </div>
      <div class="desconto-linha">
        <select class="input desconto-tipo" aria-label="Tipo de desconto" (change)="estado.descontoTipo.set(valorDe($event))">
          <option value="" [selected]="estado.descontoTipo() === ''">Sem desconto</option>
          <option value="VALOR" [selected]="estado.descontoTipo() === 'VALOR'">Valor (R$)</option>
          <option value="PERCENTUAL" [selected]="estado.descontoTipo() === 'PERCENTUAL'">Percentual (%)</option>
        </select>
        <input class="input desconto-valor" type="number" min="0" step="0.01" placeholder="0,00" aria-label="Valor do desconto"
               [appModelo]="estado.descontoValor()" (appModeloChange)="estado.descontoValor.set($event)">
        <span class="desconto-resultado">{{ (estado.totais().desconto > 0 ? '- ' : '') + moeda(estado.totais().desconto) }}</span>
      </div>
    </section>
  `,
})
export class AbaItens {
  protected readonly estado = inject(EstadoPedidoForm);
  protected readonly tipo = signal<'servico' | 'peca'>('servico');
  protected readonly moeda = moeda;
  protected readonly valorDe = valorDe;
}
