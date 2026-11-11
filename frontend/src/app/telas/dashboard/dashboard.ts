import { Component, computed, inject, signal } from '@angular/core';
import { CacheService } from '../../core/cache.service';
import { TopoService } from '../../core/topo.service';
import { valorDe } from '../../shared/evento';
import { moeda } from '../../shared/formatacao';
import { LinhaPedido } from '../../shared/linha-pedido';
import { StatCard } from '../../shared/stat-card';
import { GrupoEncerrados, PATH_ENCERRADOS } from '../encerrados/encerrados';
import { BlocoAgregado } from './bloco-agregado';

type TipoAgregado = 'cliente' | 'categoria';

/** Dashboard (#/dashboard): telaDashboardEncerrados do app.js — mês, pedidos do mês e valores por cliente/categoria. */
@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.html',
  imports: [LinhaPedido, StatCard, BlocoAgregado],
})
export class Dashboard {
  private readonly cache = inject(CacheService);

  protected readonly grupos = signal<GrupoEncerrados[] | null>(null);

  // Ficam fora do dado (uma revalidação em segundo plano não os reseta)
  // pra não perder a seleção do usuário se os dados mudarem enquanto ele olha.
  private readonly mesEscolhido = signal<string | null>(null);
  protected readonly tipoAgregado = signal<TipoAgregado>('cliente');

  /** Mês escolhido, ou o mais recente se ainda não escolheu (ou se o escolhido sumiu). */
  protected readonly mes = computed(() => {
    const grupos = this.grupos() ?? [];
    const escolhido = this.mesEscolhido();
    return escolhido !== null && grupos.some(g => g.mes === escolhido) ? escolhido : grupos[0]?.mes;
  });
  protected readonly grupo = computed(() => (this.grupos() ?? []).find(g => g.mes === this.mes()));
  protected readonly itens = computed(() =>
    this.tipoAgregado() === 'cliente' ? this.grupo()?.porCliente : this.grupo()?.porCategoria);
  protected readonly tituloTotal = computed(() => this.tipoAgregado() === 'cliente' ? 'Total (cliente)' : 'Total (categoria)');

  protected readonly moeda = moeda;
  protected readonly opcoes: [TipoAgregado, string][] = [['cliente', 'Por cliente'], ['categoria', 'Por categoria']];

  constructor() {
    inject(TopoService).definirTitulo('Dashboard');
    this.cache.comCache<GrupoEncerrados[]>(PATH_ENCERRADOS, g => this.grupos.set(g))
      .catch(() => { /* o interceptor já avisou */ });
  }

  protected escolherMes(ev: Event): void {
    this.mesEscolhido.set(valorDe(ev));
  }
}
