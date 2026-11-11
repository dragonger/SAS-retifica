import { Component, inject, signal } from '@angular/core';
import { ModeloEntrada } from '../../shared/entradas';
import { valorDe } from '../../shared/evento';
import { moeda } from '../../shared/formatacao';
import { EstadoPedidoForm } from './estado-pedido-form';
import { SeletorItens } from './seletor-itens';

/**
 * Etapa "Itens": alternador Serviços/Peças e a barra do total, com subtotal, desconto e total recalculados ao vivo
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
    <div style="display:flex;flex-direction:column;gap:12px" [hidden]="tipo() !== 'servico'">
      <app-seletor-itens tipo="servicos" rotuloNovo="Novo serviço" singular="serviço" endpoint="/api/servicos-catalogo" />
    </div>
    <div style="display:flex;flex-direction:column;gap:12px" [hidden]="tipo() !== 'peca'">
      <app-seletor-itens tipo="pecas" [comQuantidade]="true" rotuloNovo="Nova peça" singular="peça" [feminino]="true" endpoint="/api/pecas-catalogo" />
    </div>

    <div class="barra-total barra-total-form">
      <div style="display:flex;justify-content:space-between;font-size:13px;opacity:.7">
        <span>Subtotal</span><span>{{ moeda(estado.totais().subtotal) }}</span>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <select class="input" style="width:150px;flex:none" aria-label="Tipo de desconto" (change)="estado.descontoTipo.set(valorDe($event))">
          <option value="" [selected]="estado.descontoTipo() === ''">Sem desconto</option>
          <option value="VALOR" [selected]="estado.descontoTipo() === 'VALOR'">Valor (R$)</option>
          <option value="PERCENTUAL" [selected]="estado.descontoTipo() === 'PERCENTUAL'">Percentual (%)</option>
        </select>
        <input class="input" type="number" min="0" step="0.01" placeholder="0,00" style="flex:1;min-width:0" aria-label="Valor do desconto"
               [appModelo]="estado.descontoValor()" (appModeloChange)="estado.descontoValor.set($event)">
        <span style="font-size:13px;opacity:.7;white-space:nowrap">{{ (estado.totais().desconto > 0 ? '- ' : '') + moeda(estado.totais().desconto) }}</span>
      </div>
      <div class="linha-total">
        <span>Total</span><span class="valor">{{ moeda(estado.totais().total) }}</span>
      </div>
    </div>
  `,
})
export class AbaItens {
  protected readonly estado = inject(EstadoPedidoForm);
  protected readonly tipo = signal<'servico' | 'peca'>('servico');
  protected readonly moeda = moeda;
  protected readonly valorDe = valorDe;
}
