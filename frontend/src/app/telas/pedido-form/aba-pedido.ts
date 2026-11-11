import { Component, inject } from '@angular/core';
import { Campo } from '../../shared/campo';
import { valorDe } from '../../shared/evento';
import { ModeloEntrada } from '../../shared/entradas';
import { STATUS_OPCOES } from '../../shared/rascunho-pedido';
import { EstadoPedidoForm } from './estado-pedido-form';

/** Etapa "Pedido": situação (só na edição), descrição, entrega estimada e observação. */
@Component({
  selector: 'app-aba-pedido',
  imports: [Campo, ModeloEntrada],
  host: { style: 'display: contents' },
  template: `
    <!-- pedido novo sempre começa "Aberto": a situação só aparece ao editar -->
    @if (estado.editando()) {
      <app-campo rotulo="Situação">
        <select class="input" (change)="estado.status.set(valorDe($event))">
          @for (o of opcoesStatus; track o[0]) {
            <option [value]="o[0]" [selected]="estado.status() === o[0]">{{ o[1] }}</option>
          }
        </select>
      </app-campo>
    }
    <app-campo rotulo="Descrição">
      <input class="input" type="text" maxlength="255" placeholder="Ex.: Retífica completa" [appModelo]="estado.descricao()" (appModeloChange)="estado.descricao.set($event)">
    </app-campo>
    <app-campo rotulo="Entrega estimada">
      <input class="input" type="date" [appModelo]="estado.entrega()" (appModeloChange)="estado.entrega.set($event)">
    </app-campo>
    <app-campo rotulo="Observação">
      <textarea class="input" rows="4" maxlength="2000" placeholder="Detalhes adicionais do serviço" [appModelo]="estado.observacao()" (appModeloChange)="estado.observacao.set($event)"></textarea>
    </app-campo>
  `,
})
export class AbaPedido {
  protected readonly estado = inject(EstadoPedidoForm);
  protected readonly opcoesStatus = STATUS_OPCOES;
  protected readonly valorDe = valorDe;
}
