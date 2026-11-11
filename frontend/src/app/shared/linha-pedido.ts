import { Component, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { moeda } from './formatacao';

/** Pedido como vem das listas e do dashboard (campos usados pela linha). */
export interface PedidoResumo {
  id: number;
  clienteNome?: string | null;
  situacao: string;
  componentesResumo?: string | null;
  dataEntrega?: string | null;
  totalGeral?: number | string | null;
  finalizado?: boolean;
}

export const CLASSE_SITUACAO: Record<string, string> = {
  'Aberto': 'tag-neutral',
  'Em andamento': 'tag-outline',
  'Pronto': 'tag-accent',
  'Atrasado': 'tag-accent-2',
  'Finalizado': 'tag-finalizado',
};

/** Linha de pedido das listas (linhaPedido + tagSituacao do app.js). */
@Component({
  selector: 'app-linha-pedido',
  host: { style: 'display: contents' },
  template: `
    <div class="linha" (click)="abrir()">
      <div class="linha-topo">
        <span class="linha-titulo">{{ pedido().clienteNome || '-' }}</span>
        <span [class]="'tag ' + classeSituacao()">
          @if (pedido().situacao === 'Atrasado') {
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
          }
          @if (pedido().situacao === 'Finalizado') {
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6 9 17l-5-5"/></svg>
          }
          {{ pedido().situacao }}
        </span>
      </div>
      <div class="linha-sub">{{ pedido().componentesResumo || '-' }}</div>
      <div class="linha-meta">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/></svg>
        <!-- nº do pedido = nº do orçamento no PDF (ex.: 0137) -->
        <span>{{ meta() }}</span>
      </div>
    </div>
  `,
})
export class LinhaPedido {
  readonly pedido = input.required<PedidoResumo>();
  private readonly router = inject(Router);

  classeSituacao(): string {
    return CLASSE_SITUACAO[this.pedido().situacao] || 'tag-neutral';
  }

  meta(): string {
    const p = this.pedido();
    return 'Nº ' + String(p.id).padStart(4, '0') + '  ·  ' + (p.finalizado ? 'Entregue ' : 'Entrega ')
      + (p.dataEntrega || '-') + '  ·  ' + moeda(p.totalGeral);
  }

  abrir(): void {
    void this.router.navigate(['/pedidos', this.pedido().id]);
  }
}
