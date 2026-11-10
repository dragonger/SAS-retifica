import { Component, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { CacheService } from '../../core/cache.service';
import { TopoService } from '../../core/topo.service';
import { LinhaPedido, PedidoResumo } from '../../shared/linha-pedido';

/** Resposta de GET /api/pedidos/dashboard. */
export interface Dashboard {
  abertos: number;
  hoje: number;
  prontos: number;
  atrasados: number;
  entregasHoje: PedidoResumo[];
}

type VarianteCard = 'accent' | 'neutral' | 'accent-2' | 'danger';

interface CardInicio {
  kicker: string;
  valor: number;
  sub: string;
  variante: VarianteCard;
  filtro: string;
  }

@Component({
  selector: 'app-inicio',
  templateUrl: './inicio.html',
  imports: [LinhaPedido],
})
export class Inicio {
  private readonly cache = inject(CacheService);
  private readonly auth = inject(AuthService);
  private readonly topo = inject(TopoService);
  private readonly router = inject(Router);

  protected readonly dash = signal<Dashboard | null>(null);
  protected readonly hoje = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

  constructor() {
    effect(() => this.topo.definirTitulo(this.auth.sessao()?.empresaNome || 'Retífica'));
    this.cache.comCache<Dashboard>('/api/pedidos/dashboard', d => this.dash.set(d))
      .catch(() => { /* o interceptor já avisou (sem conexão / erro) */ });
  }

  protected cards(d: Dashboard): CardInicio[] {
    return [
      { kicker: 'Em aberto', valor: d.abertos, sub: 'pedidos', variante: 'accent', filtro: 'abertos' },
      { kicker: 'Entregas hoje', valor: d.hoje, sub: 'pedidos', variante: 'neutral', filtro: 'hoje' },
      { kicker: 'Prontos', valor: d.prontos, sub: 'p/ retirada', variante: 'accent-2', filtro: 'prontos' },
      { kicker: 'Atrasados', valor: d.atrasados, sub: 'pedidos', variante: 'danger', filtro: 'atrasados' },
    ];
  }

  protected irParaPedidos(filtro?: string): void {
    void this.router.navigate(['/pedidos'], filtro ? { queryParams: { filtro } } : {});
  }

  protected novoPedido(): void {
    void this.router.navigate(['/pedidos/novo']);
  }
}
