import { Component, computed, inject, signal } from '@angular/core';
import { CacheService } from '../../core/cache.service';
import { TopoService } from '../../core/topo.service';
import { moeda } from '../../shared/formatacao';
import { LinhaPedido, PedidoResumo } from '../../shared/linha-pedido';

/** Item de "valor por cliente" / "por categoria" do dashboard. */
export interface ItemAgregado {
  descricao: string;
  total: number | string;
}

/** Um mês de GET /api/pedidos/encerrados. */
export interface GrupoEncerrados {
  mes: string;
  quantidade: number;
  total: number | string;
  pedidos: PedidoResumo[];
  porCliente: ItemAgregado[];
  porCategoria: ItemAgregado[];
}

export const PATH_ENCERRADOS = '/api/pedidos/encerrados';

/** Encerrados (#/encerrados): telaEncerrados do app.js — um acordeão por mês. */
@Component({
  selector: 'app-encerrados',
  templateUrl: './encerrados.html',
  imports: [LinhaPedido],
})
export class Encerrados {
  private readonly cache = inject(CacheService);

  protected readonly grupos = signal<GrupoEncerrados[] | null>(null);
  protected readonly totalPedidos = computed(() => (this.grupos() ?? []).reduce((a, g) => a + g.quantidade, 0));
  protected readonly moeda = moeda;

  /** Meses que a pessoa abriu/fechou na mão; os demais seguem o padrão (só o mais recente começa aberto). */
  private readonly alternados = signal<Record<string, boolean>>({});

  constructor() {
    inject(TopoService).definirTitulo('Encerrados');
    this.cache.comCache<GrupoEncerrados[]>(PATH_ENCERRADOS, g => this.grupos.set(g))
      .catch(() => { /* o interceptor já avisou */ });
  }

  /** Só o mês mais recente começa aberto: com todos abertos a lista crescia sem fim. */
  protected aberto(g: GrupoEncerrados, idx: number): boolean {
    return this.alternados()[g.mes] ?? idx === 0;
  }

  protected alternar(g: GrupoEncerrados, idx: number): void {
    const atual = this.aberto(g, idx);
    this.alternados.update(m => ({ ...m, [g.mes]: !atual }));
  }
}
