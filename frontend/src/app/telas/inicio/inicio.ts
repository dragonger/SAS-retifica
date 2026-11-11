import { Component, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AltoMedidasService, ResumoAltoMedidas } from '../../core/alto-medidas.service';
import { AuthService } from '../../core/auth.service';
import { CacheService } from '../../core/cache.service';
import { TopoService } from '../../core/topo.service';
import { CartaoDevidoAoDaniel } from '../../shared/cartao-devido-ao-daniel';
import { LinhaPedido, PedidoResumo } from '../../shared/linha-pedido';
import { SecaoRascunhos } from '../../shared/secao-rascunhos';

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
  imports: [LinhaPedido, CartaoDevidoAoDaniel, SecaoRascunhos],
})
export class Inicio {
  private readonly cache = inject(CacheService);
  private readonly auth = inject(AuthService);
  private readonly topo = inject(TopoService);
  private readonly router = inject(Router);
  private readonly altoMedidas = inject(AltoMedidasService);

  protected readonly dash = signal<Dashboard | null>(null);
  /** Cartão do Daniel: só quando a integração está ligada e há algo a repassar. */
  protected readonly daniel = signal<ResumoAltoMedidas | null>(null);
  protected readonly hoje = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

  constructor() {
    effect(() => this.topo.definirTitulo(this.auth.sessao()?.empresaNome || 'Retífica'));
    this.cache.comCache<Dashboard>('/api/pedidos/dashboard', d => this.dash.set(d))
      .catch(() => { /* o interceptor já avisou (sem conexão / erro) */ });
    // falha silenciosa (sem integração ou sem conexão): o Início segue normal
    this.altoMedidas.resumo()
      .then(r => { if (r && Number(r.quantidadeDevida) > 0) this.daniel.set(r); })
      .catch(() => { /* sem integração */ });
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

  protected abrirAltoMedidas(): void {
    void this.router.navigateByUrl('/alto-medidas');
  }

  protected novoPedido(): void {
    void this.router.navigate(['/pedidos/novo']);
  }
}
